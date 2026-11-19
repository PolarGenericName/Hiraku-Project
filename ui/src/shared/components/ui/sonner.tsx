import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "#0d0d12",
          "--normal-text": "#e5e7eb",
          "--normal-border": "rgba(255,255,255,0.1)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
