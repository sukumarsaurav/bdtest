import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Flix BD Platform",
  description: "Flix India Business Development Tool",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  )
}
