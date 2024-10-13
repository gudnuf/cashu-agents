import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Link from "next/link";
import { ProofProvider } from "@/hooks/useProofStorage";
import { WalletProvider } from "@/hooks/useWalletManager";
import { NDKProvider } from "@/hooks/useNostr";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <NDKProvider>
      <ProofProvider>
        <WalletProvider>
          <div className="min-h-screen bg-gray-100">
            <header className="bg-gray-800 text-white p-4">
              <nav className="container mx-auto flex justify-between">
                <Link href="/" className="text-xl font-bold">
                  AI Chat Project
                </Link>
                <ul className="flex space-x-4">
                  <li>
                    <Link href="/" className="hover:text-gray-300">
                      Home
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/background-service"
                      className="hover:text-gray-300"
                    >
                      Background Service
                    </Link>
                  </li>
                </ul>
              </nav>
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
