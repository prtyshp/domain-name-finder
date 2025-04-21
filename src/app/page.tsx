"use client";

import { useState } from "react";

export default function Home() {
  // Consolidate your form inputs into one object
  const [formData, setFormData] = useState({
    keywords: "",
    description: "",
  });

  // Consolidate loading & error states
  const [status, setStatus] = useState({
    isLoading: false,
    errorMsg: "",
  });

  const [domains, setDomains] = useState<{ name: string }[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);

  // Update a single key in formData
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleGenerate = async () => {
    const { keywords, description } = formData;
    if (!keywords && !description) return;

    // Reset states
    setStatus({ isLoading: true, errorMsg: "" });
    setDomains([]);
    setLoadedCount(0);

    try {
      const response = await fetch("/api/generate-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, description }),
      });

      if (!response.body) {
        throw new Error("No response stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // keep last partial line for next iteration
        buffer = lines.pop() || "";

        for (const line of lines) {
          const clean = line.trim();
          if (clean && clean.toLowerCase().endsWith(".com")) {
            setDomains((prev) => [...prev, { name: clean }]);
            setLoadedCount((prev) => prev + 1);
          } else if (clean.toLowerCase().includes("no available domains")) {
            setStatus((prev) => ({
              ...prev,
              errorMsg: clean,
            }));
          }
        }
      }
    } catch (err) {
      console.error("Streaming error:", err);
      setStatus({
        isLoading: false,
        errorMsg: "Something went wrong. Please try again.",
      });
      return;
    }

    setStatus((prev) => ({ ...prev, isLoading: false }));
  };

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const toggleFavorite = (name: string) => {
    setFavorites((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(name)) {
        newSet.delete(name);
      } else {
        newSet.add(name);
      }
      return newSet;
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-10 bg-gradient-to-br from-slate-50 to-slate-200">
      <h1 className="text-4xl font-bold mb-6 text-gray-800">Domain Name Finder</h1>

      <input
        type="text"
        name="keywords"
        placeholder="Enter keywords (e.g., fast, trade)"
        value={formData.keywords}
        onChange={handleChange}
        className="border p-2 rounded w-full max-w-md mb-4 placeholder:text-gray-500 text-gray-900"
      />

      <textarea
        name="description"
        placeholder="Briefly describe your project or product"
        value={formData.description}
        onChange={handleChange}
        rows={4}
        className="border p-2 rounded w-full max-w-md mb-4 placeholder:text-gray-500 text-gray-900"
      />

      {status.isLoading ? (
        <button
          disabled
          className="bg-gray-400 text-white px-4 py-2 rounded cursor-not-allowed"
        >
          Generating...
        </button>
      ) : (
        <button
          onClick={handleGenerate}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Generate
        </button>
      )}

      {status.isLoading && (
        <div className="text-sm text-gray-600 mt-2 mb-4">
          Loaded {loadedCount}
        </div>
      )}

      {status.errorMsg && (
        <div className="mt-4 text-red-600 font-medium">{status.errorMsg}</div>
      )}

      {/* Optional spinner/loader */}
      {status.isLoading && (
        <div className="mt-4 animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
      )}

      <div className="mt-6 w-full max-w-md">
        {domains.map((domain, index) => {
          const isFavorited = favorites.has(domain.name);
          const star = isFavorited ? "★" : "☆";

          return (
            <div
              key={index}
              className="rounded-2xl p-4 mb-4 bg-white shadow-md hover:shadow-lg transition flex justify-between items-center animate-fade-in"
            >
              <div className="flex flex-col">
                <span className={`text-lg ${isFavorited ? "text-yellow-600 font-semibold" : "text-gray-800"}`}>
                  {domain.name}
                </span>
              </div>
              <div className="flex gap-3 items-center">
                <button
                  onClick={() => handleCopy(domain.name, index)}
                  className="text-sm px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition"
                >
                  {copiedIndex === index ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => toggleFavorite(domain.name)}
                  className={`text-xl transition ${
                    isFavorited ? "text-yellow-500 hover:scale-110" : "text-gray-400 hover:text-yellow-400"
                  }`}
                >
                  {star}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
