const express = require("express");
const generatePreview = require("./index");
const cors = require("cors");

const app = express();
// Enable CORS for all routes
// const corsOptions = {
//     origin: 'http://localhost:3003', // Replace with your Next.js app's URL
//     optionsSuccessStatus: 200
//   };
// app.use(cors(corsOptions));
app.use(cors());
app.use(express.json());

app.post("/generate-preview", generatePreview);

const PORT = process.env.PORT || 3407;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
