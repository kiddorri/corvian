export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="-mx-4 -my-4 lg:-mx-6 lg:-my-6">{children}</div>;
}
