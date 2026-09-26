import Link from "next/link";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "/issues", label: "Browse issues" },
      { href: "/report", label: "Report an issue" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create account" },
    ],
  },
];

const SiteFooter = () => (
  <footer className="border-t bg-muted/30">
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-start md:justify-between">
      <div className="space-y-1">
        <p className="font-heading text-sm font-semibold">CivicTrack</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Report civic issues, follow their progress, and hold your local
          government accountable.
        </p>
      </div>

      <div className="flex gap-10">
        {COLUMNS.map((column) => (
          <div key={column.title} className="space-y-2">
            <p className="text-sm font-medium">{column.title}</p>
            <ul className="space-y-1.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </footer>
);

export default SiteFooter;
