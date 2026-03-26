import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Moderator Skill Registry
 * Used by AI to match ticket requirements against known moderator skill sets
 */
const MODERATOR_SKILLS = {
  "System Admin": [
    "Management",
    "Security",
    "Infrastructure",
    "Database Optimization",
    "API Architecture",
    "AI Governance",
    "IAM",
    "Compliance",
    "Network Security",
    "System Monitoring",
    "Incident Response",
    "Cloud Management",
  ],
  "AI Moderator": [
    "Python",
    "AI/ML",
    "OpenAI API",
    "LangChain",
    "Vector Databases",
    "Prompt Engineering",
    "HuggingFace",
    "FastAPI",
    "RAG",
    "Fine-tuning",
  ],
  "Frontend Moderator": [
    "HTML5",
    "CSS3",
    "JavaScript",
    "React",
    "Tailwind CSS",
    "Next.js",
    "TypeScript",
    "GraphQL",
    "Webpack",
    "Accessibility (a11y)",
  ],
  "Backend Moderator": [
    "Node.js",
    "Express",
    "MongoDB",
    "PostgreSQL",
    "Redis",
    "Payment Processing",
    "GraphQL",
    "REST APIs",
    "Microservices",
    "JWT Auth",
  ],
  "DevOps Moderator": [
    "Docker",
    "Kubernetes",
    "AWS",
    "GitHub Actions",
    "Nginx",
    "Linux",
    "Terraform",
    "CI/CD Pipelines",
    "Monitoring",
    "Ansible",
  ],
};


const ALL_SKILLS = [...new Set(Object.values(MODERATOR_SKILLS).flat())];

/**
 * Standard Ticket Analysis
 */
export const analyzeTicket = async (ticket) => {
  const systemInstruction = `You are an expert AI assistant that processes technical support tickets.

Your job is to:
1. Summarize the issue.
2. Estimate its priority.
3. Provide helpful notes and resource links for human moderators.
4. Extract the relevant technical skills required to resolve this ticket.

SKILL EXTRACTION RULES:
- You must ONLY return skills from this predefined list: [${ALL_SKILLS.join(", ")}]
- Match skills based on the technical context of the ticket (e.g., a React bug → return "React", "JavaScript", "TypeScript")
- Return between 2 to 6 most relevant skills only
- Do NOT invent or add skills outside the predefined list
- Keep Helpful Notes crisp: 2-4 lines only

IMPORTANT: Respond with *only* valid raw JSON. Do NOT include markdown code fences.`;

  const userPrompt = `Analyze the following support ticket and provide a JSON object with:
- summary: A short 1-2 sentence summary.
- priority: One of "low", "medium", or "high".
- helpfulNotes: Detailed technical explanation for moderators (2-4 lines).
- relatedSkills: Array of relevant skills strictly from the predefined skill list.

Ticket Title: ${ticket.title}
Ticket Description: ${ticket.description}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        responseMimeType: "application/json",
        systemInstruction: systemInstruction,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });
    return parseAIResponse(response.text) || fallbackResponse();
  } catch (e) {
    console.error("❌ AI Analysis failed:", e.message);
    return fallbackResponse();
  }
};

/**
 * Semantic Duplicate Detection
 */
export const checkDuplicate = async (newTicket, existingTickets) => {
  if (!existingTickets || existingTickets.length === 0) return null;

  const systemInstruction = `You are a ticket deduplication specialist. 
Determine if a new ticket is a semantically similar duplicate of an existing ticket.
Even if wording is different, identify if the underlying cause is the same.
Return ONLY a JSON object:
{
  "isDuplicate": boolean,
  "parentTicketId": "string or null",
  "reason": "brief explanation"
}`;

  const ticketList = existingTickets
    .map(
      (t) => `ID: ${t._id}, Title: ${t.title}, Description: ${t.description}`,
    )
    .join("\n---\n");

  const userPrompt = `New Ticket: ${newTicket.title} - ${newTicket.description}
Existing Open Tickets:
${ticketList}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        responseMimeType: "application/json",
        systemInstruction: systemInstruction,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });
    const result = parseAIResponse(response.text);
    return result && result.isDuplicate ? result : null;
  } catch (e) {
    console.error("❌ Duplicate check failed:", e.message);
    return null;
  }
};


function parseAIResponse(raw) {
  if (!raw) return null;
  try {
    let cleaned = String(raw).trim();

    
    const markdownMatch =
      cleaned.match(/```json\n([\s\S]*?)\n```/i) ||
      cleaned.match(/```([\s\S]*?)```/i);
    if (markdownMatch) {
      cleaned = markdownMatch[1].trim();
    }

    
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }

    const parsedResult = JSON.parse(cleaned);

    
    if (parsedResult.priority) {
      parsedResult.priority = parsedResult.priority.toUpperCase();
    }

    
    if (Array.isArray(parsedResult.relatedSkills)) {
      parsedResult.relatedSkills = parsedResult.relatedSkills.filter((skill) =>
        ALL_SKILLS.map((s) => s.toLowerCase()).includes(skill.toLowerCase()),
      );
    }

    return parsedResult;
  } catch (err) {
    console.error("⚠️ JSON Parsing error:", err.message);
    return null;
  }
}

function fallbackResponse() {
  return {
    summary: "Manual review required",
    priority: "MEDIUM",
    helpfulNotes: "AI processing encountered an error. Manual triage needed.",
    relatedSkills: ["Manual Review"],
  };
}
