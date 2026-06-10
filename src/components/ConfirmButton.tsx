"use client";

export function ConfirmButton({
  children,
  message = "Are you sure?",
  className = "btn btn-sm btn-danger",
}: {
  children: React.ReactNode;
  message?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
