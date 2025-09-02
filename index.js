// @ts-nocheck
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const OpenAI = require("openai");
const nodemailer = require("nodemailer");
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

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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
    const budgetCollection = db.collection("budget");
    const questionsCollection = db.collection("questions");
    const plannerCollection = db.collection("monthlyPlannerTasks");

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

    // GET /budget - fetch all budget items
    app.get("/budget", async (req, res) => {
      try {
        const items = await budgetCollection.find().toArray();
        res.status(200).json(items);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ message: "Failed to fetch budget items", error });
      }
    });

    // POST /budget - add a new budget item
    app.post("/budget", async (req, res) => {
      try {
        const { type, category, amount, date, description } = req.body;
        if (!type || !category || !amount || !date) {
          return res
            .status(400)
            .json({ message: "Required fields are missing" });
        }

        const result = await budgetCollection.insertOne({
          type,
          category,
          amount,
          date,
          description,
        });

        res.status(201).json({ ...req.body, _id: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to add budget item", error });
      }
    });

    // DELETE /budget/:id - delete a budget item
    app.delete("/budget/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid budget ID" });
        }

        await budgetCollection.deleteOne({ _id: new ObjectId(id) });
        res.status(200).json({ message: "Budget item deleted" });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ message: "Failed to delete budget item", error });
      }
    });

    // PUT /budget/:id - update a budget item
    app.put("/budget/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid budget ID" });
        }

        const { type, category, amount, date, description } = req.body;
        const result = await budgetCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: { type, category, amount, date, description } },
          { returnDocument: "after" }
        );

        if (!result.value)
          return res.status(404).json({ message: "Item not found" });

        res.status(200).json(result.value);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ message: "Failed to update budget item", error });
      }
    });

    // GET all questions
    app.get("/questions", async (req, res) => {
      try {
        const questions = await questionsCollection.find().toArray();
        res.status(200).json(questions);
      } catch (err) {
        console.error("Fetch questions error:", err);
        res
          .status(500)
          .json({ message: "Failed to fetch questions", error: err });
      }
    });

    // POST new question
    app.post("/questions", async (req, res) => {
      try {
        const { type, difficulty, question, options, answer } = req.body;
        if (!type || !difficulty || !question || !answer) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        if (type === "MCQ" && (!options || options.length < 2)) {
          return res
            .status(400)
            .json({ message: "MCQ must have at least 2 options" });
        }

        const newQuestion = {
          type,
          difficulty,
          question,
          options,
          answer,
          createdAt: new Date(),
        };
        const result = await questionsCollection.insertOne(newQuestion);
        res.status(201).json({ ...newQuestion, _id: result.insertedId });
      } catch (err) {
        console.error("Add question error:", err);
        res.status(500).json({ message: "Failed to add question", error: err });
      }
    });

    // DELETE question by ID
    app.delete("/questions/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid question ID" });

        const result = await questionsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0)
          return res.status(404).json({ message: "Question not found" });

        res.status(200).json({ message: "Question deleted successfully" });
      } catch (err) {
        console.error("Delete question error:", err);
        res
          .status(500)
          .json({ message: "Failed to delete question", error: err });
      }
    });

    // GET all tasks
    app.get("/planner", async (req, res) => {
      try {
        const docs = await plannerCollection.find().toArray();
        const result = {};
        docs.forEach((doc) => {
          result[doc.date] = doc.tasks || [];
        });
        res.status(200).json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch tasks", error: err });
      }
    });

    // POST add a task
    app.post("/planner", async (req, res) => {
      try {
        const { date, subject, priority, notes } = req.body;
        if (!date || !subject)
          return res.status(400).json({ message: "Date & subject required" });

        const newTask = {
          id: Date.now(), // unique numeric ID
          subject,
          priority: priority || "Medium",
          notes: notes || "",
          completed: false,
          notified: false,
        };

        const existing = await plannerCollection.findOne({ date });
        if (existing) {
          // Push directly to tasks array
          await plannerCollection.updateOne(
            { date },
            { $push: { tasks: newTask } }
          );
        } else {
          await plannerCollection.insertOne({ date, tasks: [newTask] });
        }

        res.status(201).json(newTask);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to add task", error: err });
      }
    });

    // PUT toggle complete or move task
    app.put("/planner/:date/:id", async (req, res) => {
      try {
        const { date, id } = req.params;
        const { completed, date: newDate } = req.body;

        // Toggle complete
        if (completed !== undefined) {
          await plannerCollection.updateOne(
            { date, "tasks.id": Number(id) },
            { $set: { "tasks.$.completed": completed } }
          );
        }

        // Move task to another date
        if (newDate && newDate !== date) {
          const taskDoc = await plannerCollection.findOne({ date });
          const task = taskDoc.tasks.find((t) => t.id == id);
          if (!task) return res.status(404).json({ message: "Task not found" });

          // Remove from old date
          await plannerCollection.updateOne(
            { date },
            { $pull: { tasks: { id: Number(id) } } }
          );

          // Insert into new date
          const existingNew = await plannerCollection.findOne({
            date: newDate,
          });
          if (existingNew) {
            await plannerCollection.updateOne(
              { date: newDate },
              { $push: { tasks: task } }
            );
          } else {
            await plannerCollection.insertOne({ date: newDate, tasks: [task] });
          }
        }

        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to update task", error: err });
      }
    });

    // DELETE task
    app.delete("/planner/:date/:id", async (req, res) => {
      try {
        const { date, id } = req.params;
        await plannerCollection.updateOne(
          { date },
          { $pull: { tasks: { id: Number(id) } } }
        );
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete task", error: err });
      }
    });

    // POST import tasks (JSON)
    app.post("/planner/import", async (req, res) => {
      try {
        const imported = req.body; // { "2025-09-01": [task, ...], ... }
        await plannerCollection.deleteMany({}); // clear old
        const docs = Object.keys(imported).map((date) => ({
          date,
          tasks: imported[date],
        }));
        await plannerCollection.insertMany(docs);
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to import tasks", error: err });
      }
    });

    // GET export tasks
    app.get("/planner/export", async (req, res) => {
      try {
        const docs = await plannerCollection.find().toArray();
        const result = {};
        docs.forEach((doc) => {
          result[doc.date] = doc.tasks || [];
        });
        res.setHeader("Content-Disposition", "attachment; filename=tasks.json");
        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to export tasks", error: err });
      }
    });

    // Send Email Notification
    app.post("/planner/notify/:id", async (req, res) => {
      const { id } = req.params;
      const { date } = req.body;

      try {
        const taskDoc = await plannerCollection.findOne({ date });
        if (!taskDoc) {
          return res.status(404).json({ message: "Date not found" });
        }

        const task = taskDoc.tasks.find((t) => t.id === Number(id));
        if (!task) {
          return res.status(404).json({ message: "Task not found" });
        }

        if (task.notified) {
          return res.status(400).json({ message: "Already notified" });
        }

        const mailOptions = {
          from: `"Student Life Toolkit" <${process.env.EMAIL_USER}>`,
          to: process.env.EMAIL_USER,
          subject: `📌 Task Reminder: ${task.subject}`,
          html: `
      <div style="max-width: 600px; margin: 20px auto; padding: 20px; background-color: #f9f9f9; font-family: Arial, sans-serif; border-radius: 12px; box-shadow: 0px 4px 15px rgba(0, 0, 0, 0.1);">
        <h2 style="text-align: center; color: #4F46E5; margin-bottom: 10px;">⏰ Task Reminder</h2>
        <p style="font-size: 16px; color: #333; text-align: center;">
          Hello! You have an upcoming task scheduled on 
          <strong style="color: #4F46E5;">${taskDoc.date}</strong>.
        </p>

        <div style="background: #ffffff; padding: 15px 20px; border-radius: 8px; margin-top: 15px; border-left: 5px solid #4F46E5;">
          <p style="font-size: 16px; margin: 5px 0;"><strong>📌 Task:</strong> ${
            task.subject
          }</p>
          <p style="font-size: 16px; margin: 5px 0;"><strong>⚡ Priority:</strong> ${
            task.priority
          }</p>
          <p style="font-size: 16px; margin: 5px 0;"><strong>📝 Notes:</strong> ${
            task.notes || "No additional notes"
          }</p>
        </div>

        <p style="margin-top: 15px; font-size: 14px; color: #555;">
          ✅ Don't forget to complete your task on time! Staying consistent keeps you ahead! 🚀
        </p>

        <div style="text-align: center; margin-top: 25px;">
          <a href="https://student-life-toolkit.com" style="padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
            Open Toolkit
          </a>
        </div>

        <hr style="margin: 25px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="text-align: center; font-size: 12px; color: #888;">
          © ${new Date().getFullYear()} Student Life Toolkit | All Rights Reserved
        </p>
      </div>
      `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent:", info.response);

        await plannerCollection.updateOne(
          { date, "tasks.id": Number(id) },
          { $set: { "tasks.$.notified": true } }
        );

        res.json({
          success: true,
          message: "📩 Email notification sent successfully!",
        });
      } catch (err) {
        console.error("❌ Email Error:", err);
        res.status(500).json({
          message: "Failed to send notification",
          error: err.message,
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
