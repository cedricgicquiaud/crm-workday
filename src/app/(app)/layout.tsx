/** Pages avec session. La coque (barre latérale, palette Cmd+K) est posée par la livraison 1.3. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">{children}</main>;
}
