export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 -my-4 lg:-mx-6 lg:-my-6 max-w-none w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]">
      {children}
    </div>
  );
}
