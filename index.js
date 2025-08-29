// @ts-nocheck
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

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
    // Save or Update User API
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        if (!user.email) {
          return res.status(400).json({ message: "Email is required" });
        }

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
      res.send(users);
    });

    // POST /dashboard - add a dashboard item
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

    // GET /dashboard - get all dashboard items
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

    // Get all classes
    app.get("/api/classes", async (req, res) => {
      try {
        const classes = await classesCollection.find().toArray();
        res.json(classes);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch classes", error });
      }
    });

    // Add new class
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

    // Update class
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

    // Delete class
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

    // Root route
    app.get("/", (req, res) => {
      res.send("🚀 student-life-toolkit-server is running");
    });

    app.listen(port, () => {
      console.log(`✅ Server running on port: ${port}`);
    });
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
  }
}

run().catch(console.dir);
