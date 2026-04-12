import { Navbar } from "@/components/shared/navbar";
import Link from "next/link";
import Image from "next/image";

export default function DataDeletionPage() {
  return (
    <>
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Data Deletion</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Instructions for deleting your data from Klone
          </p>

          <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                How to Delete Your Data
              </h2>
              <p>
                Klone provides multiple ways to delete your data and
                disconnect your social media accounts.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                Option 1: Delete Through Dashboard
              </h2>
              <ol className="list-decimal pl-6 space-y-2">
                <li>
                  Log in to your Klone account at{" "}
                  <Link href="/login" className="text-accent hover:underline">
                    klone.live/login
                  </Link>
                </li>
                <li>
                  Go to{" "}
                  <Link href="/dashboard/accounts" className="text-accent hover:underline">
                    Accounts
                  </Link>{" "}
                  to disconnect any linked social media accounts
                </li>
                <li>
                  Go to{" "}
                  <Link href="/dashboard/settings" className="text-accent hover:underline">
                    Settings
                  </Link>{" "}
                  and click &quot;Delete Account&quot; to permanently remove all your data
                </li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                Option 2: Email Request
              </h2>
              <p>
                Send an email to{" "}
                <a href="mailto:privacy@klone.live" className="text-accent hover:underline">
                  privacy@klone.live
                </a>{" "}
                with the subject line &quot;Data Deletion Request&quot; and include:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Your account email address</li>
                <li>Which data you want deleted (all data, or specific items)</li>
              </ul>
              <p className="mt-2">
                We will process your request within 30 days and confirm
                deletion by email.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                Facebook / Instagram Data Deletion
              </h2>
              <p>
                If you connected your Facebook or Instagram account through
                Klone and want to delete the data associated with that
                connection:
              </p>
              <ol className="list-decimal pl-6 space-y-2 mt-2">
                <li>
                  Log in to Klone and go to{" "}
                  <Link href="/dashboard/accounts" className="text-accent hover:underline">
                    Accounts
                  </Link>
                </li>
                <li>
                  Click &quot;Disconnect&quot; next to Facebook &amp; Instagram
                </li>
                <li>
                  This will revoke our access tokens and delete all stored
                  Facebook/Instagram data from our servers
                </li>
              </ol>
              <p className="mt-3">
                You can also remove Klone&apos;s access directly from Facebook:
              </p>
              <ol className="list-decimal pl-6 space-y-2 mt-2">
                <li>Go to Facebook Settings &amp; Privacy → Settings</li>
                <li>Click Apps and Websites</li>
                <li>Find &quot;Klone&quot; and click Remove</li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                TikTok Data Deletion
              </h2>
              <p>
                To remove Klone&apos;s access to your TikTok account:
              </p>
              <ol className="list-decimal pl-6 space-y-2 mt-2">
                <li>
                  Disconnect from Klone dashboard (
                  <Link href="/dashboard/accounts" className="text-accent hover:underline">
                    Accounts
                  </Link>
                  ), or
                </li>
                <li>
                  Open TikTok app → Profile → Settings → Security and Login →
                  Manage app permissions → Find &quot;Klone&quot; → Remove access
                </li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                What Gets Deleted
              </h2>
              <p>When you delete your account or request data deletion:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Your account profile (name, email, password hash)</li>
                <li>All OAuth access tokens for connected social accounts</li>
                <li>All uploaded media (images, videos)</li>
                <li>All saved posts and drafts</li>
                <li>All analytics and insights data cached on our servers</li>
                <li>Session cookies</li>
              </ul>
              <p className="mt-2">
                <strong className="text-foreground">Note:</strong> Content already published to
                social media platforms (TikTok, Facebook, Instagram, etc.) will
                remain on those platforms. You must delete published content
                directly from each platform.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                Confirmation
              </h2>
              <p>
                After data deletion is complete, you will receive a confirmation
                at your registered email address. If you do not receive
                confirmation within 30 days, please contact us at{" "}
                <a href="mailto:privacy@klone.live" className="text-accent hover:underline">
                  privacy@klone.live
                </a>.
              </p>
            </section>
          </div>
        </div>
      </div>

      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo-icon.png" alt="Klone" width={24} height={24} />
            <span className="text-sm text-muted-foreground">
              &copy; 2026 Klone. All rights reserved.
            </span>
          </div>
          <div className="flex gap-6">
            <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/data-deletion" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Data Deletion</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
