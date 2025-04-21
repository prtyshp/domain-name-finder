import { NextRequest} from "next/server";
const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DOMAIN_CHECK_ENDPOINT = "https://api.domainsdb.info/v1/domains/search?zone=com&domain=";


// helper function to check domain availability
async function isDomainAvailable(domain: string): Promise<boolean> {
    try {
      const res = await fetch(`${DOMAIN_CHECK_ENDPOINT}${domain}`);
      const data = await res.json();
      return !(data.domains && data.domains.length > 0); // available if not found
    } catch {
      console.error("Domain check failed for:", domain);
      return false; // fallback to 'taken' if error
    }
  }
  

  export async function POST(req: NextRequest) {
    const { keywords, description } = await req.json();
  
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
  Only return domain names, one per line. Do not include intro or explanation.
  These should:
    - Sound brandable and creative
    - Not be generic or common dictionary words
    - Be extremely unlikely to already exist
    - Use novel combinations of syllables or partial words
    - Avoid real existing companies or major sites
    - No prefixes like www or suffixes like .co or .org

    Each domain must end in ".com"

  `;
    const aiResponse = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ // llama3-70b-8192
        model: "llama3-8b-8192", // or "llama3-8b-8192" for lighter version, faster though lower quality
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
      }),
    });

    const aiData = await aiResponse.json();
    const rawText = aiData.choices?.[0]?.message?.content || "";

    const names = rawText
      .split("\n")
      .map((line: string) => line.replace(/^[-\d.]+\s*/, "").trim())
      .filter((line: string) =>
        line.length > 0 &&
        /^[a-zA-Z0-9\-\.]+$/.test(line) &&         // only valid characters
        line.length <= 30 &&                        // cutoff long garbage lines
        line.toLowerCase().endsWith(".com") &&
        !line.toLowerCase().includes("here are") && // strip intro lines
        !line.toLowerCase().includes("based on")    // strip continuation junk
           
      );

    let count = 0;
    let checked = 0  
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        for (const name of names) {
          const available = await isDomainAvailable(name);
          console.log(`Checking ${name} → ${available}`);
          checked++;
          if (available) {
            controller.enqueue(encoder.encode(`${name}\n`));
            count++;
          }
          if (count >= 5) break;
          await new Promise((r) => setTimeout(r, 1)); // small throttle
        }
        console.log(`✅ Done. Scanned ${checked}, found ${count} available.`);
        if (count === 0) {
          controller.enqueue(encoder.encode("⚠️ No available domains found this time. Please try again.\n"));
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


