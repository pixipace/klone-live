import { Navbar } from "@/components/shared/navbar";
import Link from "next/link";
import Image from "next/image";

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Last updated: April 12, 2026
          </p>

          <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                1. Introduction
              </h2>
              <p>
                Klone (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the klone.live website and
                platform. This Privacy Policy explains how we collect, use,
                disclose, and safeguard your information when you use our
                service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                2. Information We Collect
              </h2>
              <h3 className="text-base font-medium text-foreground mt-4 mb-2">
                Account Information
              </h3>
              <p>
                When you create an account, we collect your name, email address,
                and password (stored in hashed form). We never store your
                password in plain text.
              </p>

              <h3 className="text-base font-medium text-foreground mt-4 mb-2">
                Social Media Account Data
              </h3>
              <p>
                When you connect social media accounts (TikTok, Facebook,
                Instagram, X, LinkedIn, YouTube), we receive and store:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>OAuth access tokens and refresh tokens (encrypted)</li>
                <li>Your public profile information (username, profile picture, follower count)</li>
                <li>Page/account information you grant access to</li>
                <li>Post content and engagement metrics you choose to view through our platform</li>
              </ul>
              <p className="mt-2">
                We only access the permissions you explicitly grant during the
                OAuth authorization flow. You can revoke access at any time.
              </p>

              <h3 className="text-base font-medium text-foreground mt-4 mb-2">
                Content You Create
              </h3>
              <p>
                We store posts, captions, images, and videos you upload through
                our platform for the purpose of publishing them to your
                connected social media accounts.
              </p>

              <h3 className="text-base font-medium text-foreground mt-4 mb-2">
                Usage Data
              </h3>
              <p>
                We may collect information about how you interact with our
                platform, including pages visited, features used, and timestamps
                of activity.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                3. How We Use Your Information
              </h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>To provide and maintain our service</li>
                <li>To publish content to your connected social media accounts on your behalf</li>
                <li>To display analytics and insights from your connected accounts</li>
                <li>To manage comments on your posts</li>
                <li>To improve and personalize your experience</li>
                <li>To communicate with you about your account</li>
                <li>To comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                4. Data Sharing
              </h2>
              <p>
                We do not sell, trade, or rent your personal information to third
                parties. We share data only in the following cases:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong className="text-foreground">Social media platforms:</strong> To publish
                  content you create, we send your posts, images, and videos to
                  the platforms you&apos;ve connected (TikTok, Facebook, Instagram,
                  etc.)
                </li>
                <li>
                  <strong className="text-foreground">Legal requirements:</strong> If required by law
                  or legal process
                </li>
                <li>
                  <strong className="text-foreground">With your consent:</strong> When you explicitly
                  authorize us to share information
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                5. Data Storage and Security
              </h2>
              <p>
                Your data is stored securely on our servers. We use industry-standard
                security measures including:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Encrypted storage of OAuth tokens and passwords</li>
                <li>HTTPS encryption for all data in transit</li>
                <li>Secure HTTP-only cookies for session management</li>
                <li>Regular security updates and monitoring</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                6. Your Rights
              </h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Access the personal data we hold about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your account and associated data</li>
                <li>Disconnect any linked social media account at any time</li>
                <li>Export your data</li>
                <li>Withdraw consent for data processing</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                7. Data Deletion
              </h2>
              <p>
                You can delete your account and all associated data at any time
                from your{" "}
                <Link href="/dashboard/settings" className="text-accent hover:underline">
                  Settings
                </Link>{" "}
                page. When you delete your account:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>All personal information is permanently deleted</li>
                <li>All connected social media tokens are revoked and deleted</li>
                <li>All uploaded content is removed from our servers</li>
                <li>This action is irreversible</li>
              </ul>
              <p className="mt-2">
                You can also request data deletion by emailing us at{" "}
                <a href="mailto:privacy@klone.live" className="text-accent hover:underline">
                  privacy@klone.live
                </a>.
              </p>
              <p className="mt-2">
                For Facebook/Instagram specific data deletion requests, visit our{" "}
                <Link href="/data-deletion" className="text-accent hover:underline">
                  Data Deletion page
                </Link>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                8. Cookies
              </h2>
              <p>
                We use essential cookies for authentication and session
                management. These are strictly necessary for the platform to
                function and cannot be disabled. We do not use third-party
                tracking or advertising cookies.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                9. Third-Party Services
              </h2>
              <p>
                Our platform integrates with third-party social media services.
                Each has their own privacy policies:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>TikTok: https://www.tiktok.com/legal/privacy-policy</li>
                <li>Meta (Facebook/Instagram): https://www.facebook.com/privacy/policy</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                10. Children&apos;s Privacy
              </h2>
              <p>
                Our service is not intended for users under the age of 13. We do
                not knowingly collect personal information from children under
                13.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                11. Changes to This Policy
              </h2>
              <p>
                We may update this Privacy Policy from time to time. We will
                notify you of any changes by posting the new Privacy Policy on
                this page and updating the &quot;Last updated&quot; date.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                12. Contact Us
              </h2>
              <p>
                If you have any questions about this Privacy Policy, please
                contact us at:{" "}
                <a href="mailto:privacy@klone.live" className="text-accent hover:underline">
                  privacy@klone.live
                </a>
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
