import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "COMPFit | 컴퓨터 직무, 해보고 맞는지 가늠하기",
  description:
    "화면을 만들고, 규칙을 구현하고, 데이터에서 답을 찾으며 다음에 배우고 싶은 일을 발견하세요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="preload"
          href="/fonts/PretendardVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
