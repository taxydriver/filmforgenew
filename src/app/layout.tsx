import "./globals.css";
import { FilmforgeChatProvider } from "@/lib/chatContext";
import GlobalChatDock from "@/components/GlobalChatDock";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-slate-950">
      <body>
        <FilmforgeChatProvider>
          {children}
          <GlobalChatDock />
        </FilmforgeChatProvider>
      </body>
    </html>
  );
}