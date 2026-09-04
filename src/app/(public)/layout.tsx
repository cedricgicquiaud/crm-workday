/** Pages sans session : connexion, invitation, réinitialisation. Carte centrée, thème du navigateur. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
