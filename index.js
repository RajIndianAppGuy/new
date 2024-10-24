const { exec } = require("child_process");
const fs = require("fs").promises;
const { spawn } = require("child_process");
const path = require("path");
const util = require("util");
const { createClient } = require("@supabase/supabase-js");

const execPromise = util.promisify(exec);
require("dotenv").config();

const slidevDir = __dirname;
const basePort = 1024;
let runningInstances = {}; // Object to track running instances
let lastInteraction = {}; // Track the last interaction time for each file

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Ensure the ports table exists
async function ensurePortsTableExists() {
  const { data, error } = await supabase.from("ports").select("used_ports");

  if (error) {
    console.error("Error ensuring ports table exists:", error);
    throw new Error("Failed to check ports table in Supabase");
  }

  if (!data || data.length === 0) {
    console.log("No rows found in ports table, initializing...");
  }
}

// Fetch and increment the port
async function getAndIncrementPort() {
  await ensurePortsTableExists();

  const { data, error } = await supabase
    .from("ports")
    .select("used_ports")
    .order("used_ports", { ascending: true });

  if (error) {
    console.error("Error fetching used ports:", error);
    throw new Error("Failed to fetch used ports from Supabase");
  }

  const usedPorts = data.map((row) => row.used_ports);
  let nextPort = basePort;
  while (usedPorts.includes(nextPort)) {
    nextPort++;
  }

  const { error: insertError } = await supabase
    .from("ports")
    .insert({ used_ports: nextPort });

  if (insertError) {
    console.error("Error inserting new port:", insertError);
    throw new Error("Failed to insert new port in Supabase");
  }

  return nextPort;
}

// Start Slidev with the given port
async function startSlidev(filename) {
  try {
    if (runningInstances[filename]) {
      console.log(`Slidev instance already running for ${filename}`);
      return runningInstances[filename];
    }

    const port = await getAndIncrementPort();
    const slidesPath = path.join(slidevDir, `${filename}.md`);
    const npxPath = process.platform === "win32" ? "npx.cmd" : "npx";
    console.log(`Starting Slidev for ${slidesPath} on port ${port}`);

    return new Promise((resolve, reject) => {
      const slidevProcess = spawn(
        npxPath,
        ["slidev", slidesPath, "--port", port.toString(), "--remote"],
        {
          cwd: slidevDir,
          env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
          shell: true,
        }
      );

      let output = "";
      let errorOutput = "";

      slidevProcess.stdout.on("data", (data) => {
        output += data.toString();
        console.log(`Slidev output: ${data}`);
        if (output.includes(`http://localhost:${port}`)) {
          console.log(
            `Slidev started successfully for ${filename} on port ${port}`
          );
          runningInstances[filename] = { port, process: slidevProcess };
          lastInteraction[filename] = Date.now();
          resolve(port);
        }
      });

      slidevProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
        console.error(`Slidev error: ${data}`);
      });

      slidevProcess.on("close", (code) => {
        if (code !== 0 && !runningInstances[filename]) {
          console.error(`Slidev process exited with code ${code}`);
          reject(new Error(`Slidev failed to start: ${errorOutput}`));
        }
      });

      setTimeout(() => {
        if (!runningInstances[filename]) {
          slidevProcess.kill();
          reject(new Error("Slidev didn't start within the expected time"));
        }
      }, 60000);
    });
  } catch (error) {
    console.error(`Error starting Slidev for ${filename}:`, error);
    throw error;
  }
}

// Release the port
// Release the port
async function releasePort(port) {
  // Delete the specific port row from the 'ports' table
  const { error } = await supabase
    .from("ports")
    .delete()
    .eq("used_ports", port); // Specify the port to delete

  if (error) {
    console.error("Error releasing port:", error);
  } else {
    console.log(`Port ${port} released successfully.`);
  }
}

// Close Slidev instance
async function closeSlideInstance(filename) {
  if (runningInstances[filename]) {
    runningInstances[filename].process.kill();
    await releasePort(runningInstances[filename].port);
    delete runningInstances[filename];
    delete lastInteraction[filename];
    await fs.unlink(path.join(slidevDir, `${filename}.md`));
    console.log(`Cleaned up resources for ${filename}`);
  }
}

async function updateSlides(filename) {
  const markdown = await fetchMarkdownFromSupabase(filename);
  console.log(`Fetched markdown content for ${filename}`);

  if (!markdown) {
    throw new Error("No markdown content found in Supabase");
  }

  await fs.mkdir(slidevDir, { recursive: true });
  const slidesPath = path.join(slidevDir, `${filename}.md`);
  await fs.writeFile(slidesPath, markdown);
  console.log(`Updated ${filename}.md file. 🎉`);
}

async function fetchMarkdownFromSupabase(filename) {
  const { data, error } = await supabase
    .from("md-ppt")
    .select("md_text")
    .eq("file_name", filename)
    .single();

  if (error) {
    console.error("Error fetching markdown from Supabase:", error);
    throw new Error("Failed to fetch markdown from Supabase");
  }

  if (!data) {
    throw new Error(`No markdown found for file: ${filename}`);
  }

  return data.md_text;
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const filename = req.body.filename;

  try {
    console.log("Received request to update slides");
    await updateSlides(filename);

    let port;
    if (runningInstances[filename]) {
      port = runningInstances[filename].port;
      console.log(
        `Using existing Slidev instance for ${filename} on port ${port}`
      );
    } else {
      port = await startSlidev(filename);
    }

    lastInteraction[filename] = Date.now(); // Update the last interaction time
    console.log(
      `Returning preview URL for ${filename}: http://64.227.138.129:${port}`
    );
    res.status(200).json({ previewUrl: `http://localhost:${port}` });
  } catch (error) {
    console.error("Error updating preview:", error);
    res.status(500).json({
      message: "Failed to update preview: " + error.message,
      details: error.stack,
    });
  }
}

// Periodically check for inactivity and clean up
setInterval(async () => {
  const now = Date.now();
  const timeout = 1800000; // 30 minutes

  for (const filename in lastInteraction) {
    if (now - lastInteraction[filename] > timeout) {
      console.log(
        `No interaction for ${filename} in the last 30 minutes. Cleaning up.`
      );
      await closeSlideInstance(filename);
    }
  }
}, 60000); // Run every minute

// Cleanup function to be called when the server is shutting down
async function cleanup() {
  for (const filename in runningInstances) {
    await closeSlideInstance(filename);
  }
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

module.exports = handler;
