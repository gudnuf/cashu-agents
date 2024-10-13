import { useState } from "react";
import Head from "next/head";
import useCashuWallet from "@/hooks/useCashuWallet";
import { QRCode } from "react-qrcode";
import Image from "next/image";
import { ImgRequest } from "./image-generator";
import { initPrivkey, useNdk } from "@/hooks/useNostr";
import { NDKPrivateKeySigner, NostrEvent, NDKEvent } from "@nostr-dev-kit/ndk";
import useAi from "@/hooks/useAi";

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "ai"; content: string; imageUrl?: string }[]
  >([]);
  const [invoice, setInvoice] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [imageGeneratorPubkey, setImageGeneratorPubkey] = useState(
    "99c3e29d61a1c86c7ba77c2e355c4d05ecd5b4c6455d4b76034ae89479d54b3e"
  );
  const { generatePrompt } = useAi();
  const { receiveLightningPayment } = useCashuWallet();
  const { nip04Encrypt, publishNostrEvent, setSigner, ndk, nip04Decrypt } =
    useNdk();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const { privkey, pubkey } = initPrivkey();
    const signer = new NDKPrivateKeySigner(privkey);
    setSigner(signer);

    // Add user message to the chat
    setMessages((prev) => [...prev, { role: "user", content: input }]);

    try {
      // Get an invoice for 100 sats (adjust as needed)
      const invoice = await receiveLightningPayment(100, () => {
        console.log("Payment received successfully");
      });
      setInvoice(invoice);
      setShowQR(true);

      // Wait for 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000));
      setShowQR(false);

      // Use getImagePrompt to generate an image prompt
      // const generatedPrompt = await generatePrompt(
      //   "claude-3-5-sonnet-20240620",
      //   input
      // );
      const generatedPrompt = "A photo of a cat";
      if (!generatedPrompt) {
        throw new Error("No prompt generated");
      }

      // Add AI response to the chat
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `We generated the following prompt: ${generatedPrompt}`,
        },
      ]);

      const req: ImgRequest = {
        id: Date.now().toString(),
        cash: "123",
        prompt: generatedPrompt,
      };

      console.log("Request:", req);

      if (!imageGeneratorPubkey) {
        throw new Error("Image generator pubkey not set");
      }

      const encrypted = await nip04Encrypt(
        JSON.stringify(req),
        imageGeneratorPubkey
      );

      if (!encrypted) {
        throw new Error("Failed to encrypt request");
      }

      await publishNostrEvent({
        kind: 4,
        content: encrypted,
        tags: [["p", imageGeneratorPubkey]],
      } as NostrEvent);

      const filter = {
        kinds: [4],
        "#p": [pubkey],
        since: Math.floor(Date.now() / 1000),
      };

      const sub = ndk.subscribe(filter, { closeOnEose: true });
      console.log("Subscribing to filter:", filter);
      sub.on("event", async (e: NDKEvent) => {
        console.log("handling");
        const decrtyped = await nip04Decrypt(e.content, e.pubkey);
        if (decrtyped) {
          const response = JSON.parse(decrtyped) as { url: string };
          console.log("Request:", response);
          if (response.url) {
            // Add AI response to the chat with the image URL
            setMessages((prev) => [
              ...prev,
              {
                role: "ai",
                content: "Here is the generated image:",
                imageUrl: response.url,
              },
            ]);
          }
        } else {
          console.log("Event decryption failed");
          // TODO: Process the request
        }
      });

      // const imageUrl = await imageFromPrompt(generatedPrompt);
      // if (imageUrl) {
      //   // Add AI response to the chat with the image URL
      //   setMessages((prev) => [
      //     ...prev,
      //     {
      //       role: "ai",
      //       content: "Here is the generated image:",
      //       imageUrl: imageUrl,
      //     },
      //   ]);
      // }
    } catch (error) {
      console.error("Error generating image prompt:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content:
            "Sorry, I couldn't generate an image prompt. Please try again.",
        },
      ]);
    }

    setInput("");
  };

  return (
    <>
      <Head>
        <title>AI Chat Interface</title>
        <meta name="description" content="AI Chat Interface" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">AI Chat Interface</h1>
        <div className="mb-4">
          <input
            type="text"
            value={imageGeneratorPubkey}
            onChange={(e) => setImageGeneratorPubkey(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter Image Generator Pubkey"
          />
        </div>
        <div className="bg-white shadow-md rounded-lg p-4 mb-4 h-96 overflow-y-auto">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-2 ${
                message.role === "user" ? "text-right" : "text-left"
              }`}
            >
              <span
                className={`inline-block p-2 rounded-lg ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                {message.content}
              </span>
              {message.imageUrl && (
                <div className="mt-2">
                  <Image
                    src={message.imageUrl}
                    alt="Generated image"
                    width={300}
                    height={300}
                    className="rounded-lg"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        {showQR && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-4 rounded-lg">
              <h2 className="text-xl mb-2">
                Pay Lightning Invoice to Continue
              </h2>
              <QRCode value={invoice} size={256} />
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-grow border border-gray-300 rounded-l-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Type your message here..."
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded-r-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}
