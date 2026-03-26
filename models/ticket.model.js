import mongoose from "mongoose";

const ticketSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    status: { 
      type: String, 
      default: "OPEN" 
    },
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isDuplicate: {
      type: Boolean,
      default: false,
    },
    parentTicket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      default: null,
    },
    reportCount: {
      type: Number,
      default: 1,
    },
    priority: { 
      type: String, 
      default: "LOW" 
    },
    deadline: Date,
    helpfulNotes: String,
    relatedSkills: [String],
    moderatorMessage: {
      type: String,
      default: "",
    },
  },
  { 
    timestamps: true 
  }
);

const Ticket = mongoose.model("Ticket", ticketSchema);
export default Ticket;