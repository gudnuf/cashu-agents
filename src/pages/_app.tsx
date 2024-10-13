import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Link from "next/link";
import { ProofProvider, useProofStorage } from "@/hooks/useProofStorage";
import { WalletProvider } from "@/hooks/useWalletManager";
import { NDKProvider } from "@/hooks/useNostr";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <NDKProvider>
      <ProofProvider>
        <WalletProvider>
          <div className="min-h-screen bg-gray-100">
            <header className="bg-gray-800 text-white p-4">
              <Nav />
            </header>
            <main className="container mx-auto mt-8 px-4">
              <Component {...pageProps} />
            </main>
          </div>
        </WalletProvider>
      </ProofProvider>
    </NDKProvider>
  );
}

const Nav = () => {
  const { balance } = useProofStorage();
  return (
    <nav className="container mx-auto flex justify-between">
      <Link href="/" className="text-xl font-bold">
        Cashu Agents{" "}
      </Link>
      <ul className="flex space-x-4">
        <li>{balance} eSats</li>
      </ul>
    </nav>
  );
};
