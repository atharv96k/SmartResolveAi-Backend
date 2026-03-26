import { inngest } from "../client.js";
import Ticket from "../../models/ticket.model.js";
import User from "../../models/user.model.js";
import { NonRetriableError } from "inngest";
import { sendMail } from "../../utils/mailer.js";
import { analyzeTicket, checkDuplicate } from "../../utils/ai.js"; 

export const onTicketCreated = inngest.createFunction(
  { id: "on-ticket-create", retries: 2 },
  { event: "ticket/created" },
  async ({ event, step }) => {
    try {
      const { ticketId } = event.data;

      
      const ticket = await step.run("fetch-ticket", async () => {
        const ticketObject = await Ticket.findById(ticketId);
        if (!ticketObject) {
          throw new NonRetriableError("Ticket not found");
        }
        return ticketObject;
      });

      
      const duplicateResult = await step.run("check-duplicates", async () => {
        
        
        const openTickets = await Ticket.find({
          status: { $in: ["OPEN", "TODO", "IN_PROGRESS"] }, 
          isDuplicate: false,
          _id: { $ne: ticketId },
        }).select("title description _id");

        if (openTickets.length === 0) return null;

        
        return await checkDuplicate(ticket, openTickets);
      });

      
      if (duplicateResult && duplicateResult.isDuplicate) {
        await step.run("process-as-duplicate", async () => {
          
          const parent = await Ticket.findById(duplicateResult.parentTicketId);

          if (!parent) throw new Error("Parent ticket not found");

          
          await Ticket.findByIdAndUpdate(ticketId, {
            isDuplicate: true,
            parentTicket: duplicateResult.parentTicketId,
            status: "CLOSED",
            
            priority: parent.priority,
            relatedSkills: parent.relatedSkills,
            helpfulNotes: parent.helpfulNotes,
            assignedTo: parent.assignedTo,
            moderatorMessage: `Automated: This issue is a duplicate of ticket ${duplicateResult.parentTicketId}. We are already working on it!`,
          });

          
          const newCount = (parent.reportCount || 1) + 1;
          const updates = { reportCount: newCount };

          if (newCount >= 3) {
            updates.priority = "URGENT";
          }

          await Ticket.findByIdAndUpdate(
            duplicateResult.parentTicketId,
            updates,
          );
        });

        return { success: true, type: "duplicate" };
      }

      
      await step.run("update-initial-status", async () => {
        await Ticket.findByIdAndUpdate(ticketId, { status: "TODO" });
      });

      const aiResponse = await analyzeTicket(ticket);

      const relatedSkills = await step.run("ai-processing", async () => {
        let skills = [];
        if (aiResponse) {
          await Ticket.findByIdAndUpdate(ticketId, {
            priority: ["low", "medium", "high"].includes(
              aiResponse.priority.toLowerCase(),
            )
              ? aiResponse.priority.toLowerCase()
              : "medium",
            helpfulNotes: aiResponse.helpfulNotes || "",
            status: "IN_PROGRESS",
            relatedSkills: aiResponse.relatedSkills || [],
          });

          skills = aiResponse.relatedSkills || [];
        }
        return skills;
      });

      
      const moderator = await step.run("assign-moderator", async () => {
        let user = await User.findOne({
          role: "moderator",
          skills: {
            $elemMatch: {
              $regex: relatedSkills.join("|"),
              $options: "i",
            },
          },
        });

        if (!user) {
          user = await User.findOne({ role: "admin" });
        }

        await Ticket.findByIdAndUpdate(ticketId, {
          assignedTo: user?._id || null,
        });

        return user;
      });

      
      await step.run("send-notification", async () => {
        try {
          if (moderator) {
            const finalTicket = await Ticket.findById(ticketId);
            const subject = `New Ticket Assigned: ${finalTicket.title}`;
            const message = `Hello ${moderator.name},\n\nA new ticket has been assigned to you:\n\nTitle: ${finalTicket.title}\nDescription: ${finalTicket.description}\nPriority: ${finalTicket.priority}\n\nPlease check the ticket in your dashboard.\n\nBest regards,\nSmartResolve-AI Team`;

            await sendMail(moderator.email, subject, message);
          }
        } catch (err) {
          console.log("⚠ Notification error:", err.message);
        }
      });

      return { success: true, type: "unique" };
    } catch (error) {
      console.error(`❌ Error in onTicketCreated: ${error.message}`);
      return { success: false };
    }
  },
);
