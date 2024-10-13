import { useNdk, initPrivkey } from "@/hooks/useNostr";
import { useState, useEffect } from "react";
import Head from "next/head";
import {
  NDKEvent,
  NDKFilter,
  NDKPrivateKeySigner,
  NDKSubscription,
} from "@nostr-dev-kit/ndk";
import useAi from "@/hooks/useAi";
import { getPublicKey } from "nostr-tools";

export type ImgRequest = {
  id: string;
  //cashu token
  cash: string;
  prompt: string;
};

export default function BackgroundService() {
  const [status, setStatus] = useState("Idle");
  const [transactions, setTransactions] = useState<string[]>([]);
  const [satsReceived, totalSatsReceived] = useState(0);
  const { generateImage } = useAi();

  const { nip04Decrypt, setSigner, ndk } = useNdk();

  useEffect(() => {
    const { privkey } = initPrivkey();
    const signer = new NDKPrivateKeySigner(privkey);
    setSigner(signer);
    const pubkey = getPublicKey(privkey);

    const filter: NDKFilter = {
      kinds: [4],
      "#p": [pubkey],
      since: Math.floor(Date.now() / 1000),
    };

    const requests = new Map<string, NDKEvent>();

    const handler = async (event: NDKEvent, sub: NDKSubscription) => {
      const lastEvent = Number(localStorage.getItem("lastEvent"));
      if (lastEvent < event.created_at!) {
        localStorage.setItem("lastEvent", event.created_at!.toString());
        console.log("New event:", event);
      } else {
        console.log("Skipping event:", event);
        return;
      }
      const decrypted = await nip04Decrypt(event.content, event.pubkey);
      if (decrypted) {
        const request = JSON.parse(decrypted) as ImgRequest;
        requests.set(request.id, event);
        setStatus("Processing");
        console.log("Request:", request);
        // TODO: Process the request
        setStatus("Completed");
      } else {
        console.log("Event decryption failed");
        setStatus("Error");
      }
      sub.stop();
    };

    console.log("Subscribing to filter:", filter);
    console.log("My pubkey is ", pubkey);

    // const sub = subscribe(filter, { closeOnEose: true });
    // sub.on("event", async (e: NDKEvent) => {
    //   console.log("handling");
    //   await handler(e, sub);
    // });

    // subscribeAndHandle(filter, handler);

    const sub = ndk.subscribe(filter, { closeOnEose: true });
    sub.on("event", async (e: NDKEvent) => {
      console.log("handling");
      await handler(e, sub);
    });
  });

  return (
    <>
      <Head>
        <title>Image Generator</title>
        <meta name="description" content="Background Service Status" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Background Service</h1>
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
          {satsReceived && (
            <div>
              <span className="font-semibold">Sats Received: </span>
              <span>{satsReceived}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
