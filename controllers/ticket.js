import { inngest } from "../inngest/client.js";
import Ticket from "../models/ticket.model.js";

export const createTicket = async (req, res) => {
  try {
    const { title, description, deadline } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "Title and description are required" });
    }

    const existingMaster = await Ticket.findOne({ title, isDuplicate: false });

    if (existingMaster) {
      const duplicateTicket = await Ticket.create({
        title,
        description,
        priority: existingMaster.priority,
        status: "OPEN",                   
        relatedSkills: existingMaster.relatedSkills,
        assignedTo: existingMaster.assignedTo,
        createdBy: req.user._id.toString(),
        isDuplicate: true,
        parentTicket: existingMaster._id,
        reportCount: 1
      });

      await inngest.send({
        name: "ticket/created",
        data: { ticketId: duplicateTicket._id.toString() },
      });

      return res.status(201).json({
        message: "Duplicate issue detected. Linked to master.",
        ticket: duplicateTicket
      });
    }

    
    const newTicket = await Ticket.create({
      title,
      description,
      priority: "LOW",  
                        
      createdBy: req.user._id.toString(),
      isDuplicate: false,
      reportCount: 1
    });

    await inngest.send({
      name: "ticket/created",
      data: { ticketId: newTicket._id.toString() },
    });

    return res.status(201).json({ message: "Ticket created successfully", ticket: newTicket });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const getTickets = async (req, res) => {
  try {
    const user = req.user;
    let tickets = [];

    const buildSortedTickets = async (filter) => {
      return await Ticket.aggregate([
        { $match: filter },
        {
          $addFields: {
            priorityWeight: {
              $switch: {
                branches: [
                  { case: { $eq: [{ $toUpper: "$priority" }, "URGENT"] }, then: 4 },
                  { case: { $eq: [{ $toUpper: "$priority" }, "HIGH"] },   then: 3 },
                  { case: { $eq: [{ $toUpper: "$priority" }, "MEDIUM"] }, then: 2 },
                  { case: { $eq: [{ $toUpper: "$priority" }, "LOW"] },    then: 1 },
                ],
                default: 0,
              },
            },
          },
        },
        {
          $sort: {
            reportCount: -1,
            priorityWeight: -1,
            createdAt: -1,
          },
        },
      ]);
    };

    if (user.role === "admin") {
      tickets = await buildSortedTickets({ isDuplicate: false });
      tickets = await Ticket.populate(tickets, {
        path: "assignedTo",
        select: "name email _id",
      });

    } else if (user.role === "moderator") {
      const { Types } = await import("mongoose");
      tickets = await buildSortedTickets({
        isDuplicate: false,
        $or: [
          { assignedTo: new Types.ObjectId(user._id) },
          { createdBy: new Types.ObjectId(user._id) },
        ],
      });
      tickets = await Ticket.populate(tickets, {
        path: "assignedTo",
        select: "name email _id",
      });

    } else {
      const { Types } = await import("mongoose");
      tickets = await buildSortedTickets({
        createdBy: new Types.ObjectId(user._id),
      });
      tickets = await Ticket.populate(tickets, {
        path: "assignedTo",
        select: "name email _id",
      });
    }

    return res.status(200).json(tickets);
  } catch (error) {
    console.error("Error fetching tickets:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const getTicket = async (req, res) => {
  try {
    const user = req.user;
    let ticket;

    const selectFields = "title description status createdAt priority relatedSkills assignedTo aiNotes helpfulNotes moderatorMessage isDuplicate parentTicket reportCount";

    if (user.role === "admin") {
      ticket = await Ticket.findById(req.params.id)
        .select(selectFields)
        .populate("assignedTo", ["name", "email", "_id"])
        .populate("parentTicket", ["title", "status"]);
    } else if (user.role === "moderator") {
      ticket = await Ticket.findOne({
        _id: req.params.id,
        $or: [{ assignedTo: user._id }, { createdBy: user._id }],
      })
        .select(selectFields)
        .populate("assignedTo", ["name", "email", "_id"])
        .populate("parentTicket", ["title", "status"]);
    } else {
      ticket = await Ticket.findOne({
        _id: req.params.id,
        createdBy: user._id,
      })
        .select(selectFields)
        .populate("assignedTo", ["name", "email", "_id"])
        .populate("parentTicket", ["title", "status"]);
    }

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found or access denied" });
    }

    return res.status(200).json({ ticket });
  } catch (error) {
    console.error("Error fetching ticket:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, moderatorMessage, assignedTo } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "Title and description are required" });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admins can update ticket details" });
    }

    ticket.title = title;
    ticket.description = description;

    if (moderatorMessage !== undefined) {
      ticket.moderatorMessage = moderatorMessage;
    }

    if (assignedTo !== undefined) {
      ticket.assignedTo = assignedTo || null;
    }

    await ticket.save();

    return res.status(200).json({ message: "Ticket updated successfully", ticket });
  } catch (error) {
    console.error("Error updating ticket:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, moderatorMessage } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const allowedStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (
      req.user.role !== "admin" &&
      req.user.role !== "moderator" &&
      ticket.assignedTo?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Not authorized to update this ticket" });
    }

    ticket.status = status;

    if (moderatorMessage !== undefined) {
      ticket.moderatorMessage = moderatorMessage;
    }

    await ticket.save();

    return res.status(200).json({ message: "Ticket status updated", ticket });
  } catch (error) {
    console.error("Error updating ticket status:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
