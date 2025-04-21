import { NextRequest } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DOMAIN_CHECK_ENDPOINT =
  "https://api.domainsdb.info/v1/domains/search?zone=com&domain=";

async function isDomainAvailable(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`${DOMAIN_CHECK_ENDPOINT}${domain}`);
    const data = await res.json();
    // If the domains array is non-empty, it's presumably taken
    return !(data.domains && data.domains.length > 0);
  } catch {
    console.error("Domain check failed for:", domain);
    // On any network error, treat as unavailable
    return false;
  }
}

export async function POST(req: NextRequest) {
  const { keywords, description } = await req.json();

  // Prompt
  const prompt = `
Generate 100 short, brandable .com domain names based on the following:

Keywords: ${keywords}
Description: ${description}

Guidelines:
- Max 2 words
- 6–15 characters (excluding .com)
- Easy to pronounce
- Avoid dashes or numbers
- No existing trademarks
Only return domain names, one per line. No extra explanation. 
Each domain must end in ".com"
`;

  // Call LLM
  const aiResponse = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama3-8b-8192", // or your chosen model or // llama3-70b-8192 for bigger model
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
    }),
  });

  const aiData = await aiResponse.json();
  const rawText = aiData.choices?.[0]?.message?.content || "";

  // Clean up the lines (domain suggestions)
  const names: string[] = rawText
    .split("\n")
    .map((line: string) => line.replace(/^[-\d.]+\s*/, "").trim()) // remove leading bullet/number
    .filter(
      (line: string) =>
        line &&
        line.toLowerCase().endsWith(".com") &&
        /^[a-zA-Z0-9.-]+$/.test(line) && // valid chars
        line.length <= 30
    );

  const encoder = new TextEncoder();
  let foundCount = 0; // how many we’ve successfully found
  const maxResults = 10;
  const concurrencyLimit = 5;

  const stream = new ReadableStream({
    async start(controller) {
      // If no names at all, just end
      if (!names.length) {
        controller.enqueue(encoder.encode("⚠️ No available domains found this time.\n"));
        controller.close();
        return;
      }

      // Concurrency approach:
      let currentIndex = 0;
      const tasks: Array<Promise<void>> = [];

      const checkDomainTask = async (domain: string) => {
        const available = await isDomainAvailable(domain);
        if (available && foundCount < maxResults) {
          foundCount++;
          // Stream out the domain name
          controller.enqueue(encoder.encode(domain + "\n"));
        }
      };

      // We keep looping until we've started all checks or found maxResults
      while (currentIndex < names.length && foundCount < maxResults) {
        // fill up tasks until concurrency limit
        while (
          tasks.length < concurrencyLimit &&
          currentIndex < names.length &&
          foundCount < maxResults
        ) {
          const domain = names[currentIndex];
          currentIndex++;
          const task = checkDomainTask(domain);
          tasks.push(task);
        }

        // wait for at least one task to finish
        if (tasks.length > 0) {
          await Promise.race(tasks);
          tasks.shift(); // remove one finished task
          //const finished = await Promise.race(tasks.map((t) => t.then(() => t)));
          // remove the finished task from the array
          //tasks.splice(tasks.indexOf(finished), 1);
        }
      }

      // Wait for any remaining tasks
      await Promise.all(tasks);

      if (foundCount === 0) {
        controller.enqueue(
          encoder.encode("⚠️ No available domains found this time. Please try again.\n")
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
