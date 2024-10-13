import { useNdk, initPrivkey } from "@/hooks/useNostr";
import { useState, useEffect } from "react";
import Image from "next/image";
import Head from "next/head";
import {
  NDKEvent,
  NDKFilter,
  NDKPrivateKeySigner,
  NDKSubscription,
  NostrEvent,
} from "@nostr-dev-kit/ndk";
import useAi from "@/hooks/useAi";
import { getPublicKey } from "nostr-tools";
import { getDecodedToken } from "@cashu/cashu-ts";
import { useProofStorage } from "@/hooks/useProofStorage";

export type ImgRequest = {
  id: string;
  //cashu token
  cash: string;
  prompt: string;
};

type HistoryItem = {
  imageUrl: string;
  amountPaid: number;
};

export default function BackgroundService() {
  const [status, setStatus] = useState("Idle");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pubkey, setPubkey] = useState("");
  const { generateImage } = useAi();
  const { addProofs } = useProofStorage();

  const { nip04Decrypt, setSigner, ndk, publishNostrEvent } = useNdk();

  useEffect(() => {
    const { privkey } = initPrivkey();
    const signer = new NDKPrivateKeySigner(privkey);
    setSigner(signer);
    const publicKey = getPublicKey(privkey);
    setPubkey(publicKey);

    const filter: NDKFilter = {
      kinds: [4],
      "#p": [publicKey],
      since: Math.floor(Date.now() / 1000),
    };

    const requests = new Map<string, NDKEvent>();

    const handler = async (event: NDKEvent, sub: NDKSubscription) => {
      const lastEvent = Number(localStorage.getItem("lastEvent"));
      if (lastEvent < event.created_at!) {
        localStorage.setItem("lastEvent", event.created_at!.toString());
        console.log("New event:", event.rawEvent());
      } else {
        return;
      }
      // const decrypted = await nip04Decrypt(event.content, event.pubkey);
      const decrypted = event.content;
      if (decrypted) {
        const request = JSON.parse(decrypted) as ImgRequest;
        requests.set(request.id, event);
        setStatus("Processing");
        console.log("Request:", request);
        const proofs = getDecodedToken(request.cash).token[0].proofs;
        addProofs(proofs);
        const amountReceived = proofs.reduce((acc, p) => acc + p.amount, 0);
        const url = await generateImage("dall-e-3", request.prompt);
        const response = {
          url,
        };
        console.log("Response:", response);
        await publishNostrEvent({
          kind: 4,
          content: JSON.stringify(response),
          tags: [["p", event.pubkey]],
        } as NostrEvent).then(() => console.log("Event published"));

        // Add the generated image to history
        setHistory((prevHistory) => [
          ...prevHistory,
          { imageUrl: url || "", amountPaid: amountReceived },
        ]);

        setStatus("Completed");
      } else {
        console.log("Event decryption failed");
        setStatus("Error");
      }
      sub.stop();
    };

    console.log("Subscribing to filter:", filter);
    console.log("My pubkey is ", publicKey);

    const sub = ndk.subscribe(filter);
    sub.on("event", async (e: NDKEvent) => {
      console.log("handling");
      await handler(e, sub);
    });
  }, []);

  return (
    <>
      <Head>
        <title>Image Generator</title>
        <meta name="description" content="Background Service Status" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Image Generator </h1>
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="mb-4">
            <span className="font-semibold">Status: </span>
            <span
              className={
                status === "Processing" ? "text-green-500" : "text-gray-500"
              }
            >
              {status}
            </span>
          </div>
          <div className="mb-4">
            <span className="font-semibold">Public Key: </span>
            <span className="break-all">{pubkey}</span>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2">Generation History</h2>
            <ul>
              {history.map((item, index) => (
                <li key={index} className="mb-2">
                  <Image
                    src={item.imageUrl}
                    alt="Generated"
                    width={128}
                    height={128}
                    className="object-cover"
                  />
                  <span>Paid: {item.amountPaid} eSats</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
