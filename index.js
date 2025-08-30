// @ts-nocheck
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173", // React frontend URL
    credentials: true,
  })
);

app.use(express.json());

// OpenAI setup (latest SDK v4+)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MongoDB Connection
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("student_life_toolkit");
    const usersCollection = db.collection("users");
    const dashboardCollection = db.collection("dashboard");
    const classesCollection = db.collection("classes");

    // Save or Update User
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        if (!user.email)
          return res.status(400).json({ message: "Email is required" });

        const query = { email: user.email };
        const updatedDoc = {
          $set: {
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            createdAt: new Date(),
          },
        };
        const options = { upsert: true };
        const result = await usersCollection.updateOne(
          query,
          updatedDoc,
          options
        );

        res.status(200).json({
          success: true,
          message: "User saved successfully",
          data: result,
        });
      } catch (error) {
        res.status(500).json({ message: "Failed to save user", error });
      }
    });

    // Get all users
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.json(users);
    });

    // Dashboard endpoints
    app.post("/dashboard", async (req, res) => {
      try {
        const item = req.body;
        const result = await dashboardCollection.insertOne(item);
        res.status(200).json({
          success: true,
          message: "Dashboard item added",
          data: result,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to add dashboard item", error });
      }
    });

    app.get("/dashboard", async (req, res) => {
      try {
        const items = await dashboardCollection.find().toArray();
        res.status(200).json(items);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to fetch dashboard items", error });
      }
    });

    // Classes endpoints
    app.get("/api/classes", async (req, res) => {
      try {
        const classes = await classesCollection.find().toArray();
        res.json(classes);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch classes", error });
      }
    });

    app.post("/api/classes", async (req, res) => {
      try {
        const newClass = req.body;
        const result = await classesCollection.insertOne(newClass);
        res.json({ ...newClass, _id: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to add class", error });
      }
    });

    app.put("/api/classes/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid class ID" });

        const { name, instructor, day, startTime, endTime, color } = req.body;
        if (!name || !instructor || !day || !startTime || !endTime || !color) {
          return res.status(400).json({ message: "All fields are required" });
        }

        const result = await classesCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: { name, instructor, day, startTime, endTime, color } },
          { returnDocument: "after" }
        );

        if (!result.value)
          return res.status(404).json({ message: "Class not found" });

        res.json(result.value);
      } catch (error) {
        console.error("Update Class Error:", error);
        res.status(500).json({ message: "Failed to update class", error });
      }
    });

    app.delete("/api/classes/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid class ID" });

        await classesCollection.deleteOne({ _id: new ObjectId(id) });
        res.json({ message: "Class deleted" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to delete class", error });
      }
    });

    // AI Suggestions endpoint
    app.post("/ai/suggest", async (req, res) => {
      const { totalClasses, upcomingExams, weeklyPerformance, weakTopics } =
        req.body;

      try {
        const prompt = `
You are an academic assistant.
Total classes: ${totalClasses}
Upcoming exams: ${upcomingExams}
Weekly performance: ${weeklyPerformance?.join(", ") || "None"}
Weak topics: ${weakTopics?.join(", ") || "None"}

Suggest 5 concise, actionable study tips for the student.
`;

        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        });

        const tipsText = response.choices[0].message.content;
        const tips = tipsText
          .split("\n")
          .map((t) => t.replace(/^\d+\.?\s*/, "").trim())
          .filter((t) => t);

        res.json({ tips });
      } catch (err) {
        console.error("OpenAI Error:", err);

        if (err.code === "insufficient_quota" || err.status === 429) {
          return res.status(429).json({
            message:
              "OpenAI quota exceeded or rate limit hit. Please try again later.",
          });
        }

        res.status(500).json({
          message: "Failed to generate AI suggestions",
          error: err.message || err,
        });
      }
    });

    // Root route
    app.get("/", (req, res) => {
      res.send("🚀 student-life-toolkit-server is running");
    });

    // Start server
    app.listen(port, () => {
      console.log(`✅ Server running on port: ${port}`);
    });
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
  }
}

run().catch(console.dir);
