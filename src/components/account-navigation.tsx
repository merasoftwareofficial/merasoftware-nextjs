import Link from "@/components/link";
import { getSession } from "@/lib/auth";
import { AccountLiveLine } from "@/components/my-purchases";
import styles from "./account-navigation.module.css";

// One list builds both the tabs and the Overview boxes (docs/plan.md decision 11): a new section is
// one more entry here. My purchases is for clients only (a portal account with the customer role).
export function accountLinks(username: string, client = false) {
  return [
    { href: "/account", label: "Overview", description: "Your personal account shortcuts." },
    ...(client ? [{ href: "/account/purchases", label: "My purchases", description: "Your plans and their status. Each one opens in your client portal." }] : []),
    { href: `/members/${username}`, label: "My profile", description: "View your public community profile." },
    { href: "/account/posts", label: "My posts", description: "Find your drafts, submissions and published posts." },
    { href: "/account/offers", label: "My offers", description: "View your reserved offers and payment deadlines." },
    { href: "/account/saved", label: "Saved posts", description: "Return to articles you saved for later." },
    { href: "/subscribe/manage", label: "Notification preferences", description: "Choose your topics and notification channels." },
  ];
}

// Only these boxes carry a live line; the others are plain links (nothing waits on the client there).
const LIVE: Record<string, "purchases" | "offers"> = { "/account/purchases": "purchases", "/account/offers": "offers" };

const isClient = async () => Boolean((await getSession())?.portalRoles.includes("customer"));

export async function AccountNavigation({ username, active }: { username: string; active: string }) {
  return (
    <nav className={styles.navigation} aria-label="My Account">
      {accountLinks(username, await isClient()).map(item => (
        <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export async function AccountOverview({ username }: { username: string }) {
  return (
    <div className={styles.grid}>
      {accountLinks(username, await isClient()).filter(item => item.href !== "/account").map(item => (
        <Link className={styles.card} key={item.href} href={item.href}>
          <h2>{item.label} <span aria-hidden="true">↗</span></h2>
          <p>{item.description}</p>
          {LIVE[item.href] && <AccountLiveLine kind={LIVE[item.href]} />}
        </Link>
      ))}
    </div>
  );
}
