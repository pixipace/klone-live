import { Navbar } from "@/components/shared/navbar";
import Link from "next/link";
import Image from "next/image";

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Last updated: April 12, 2026
          </p>

          <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                1. Acceptance of Terms
              </h2>
              <p>
                By accessing or using Klone (&quot;the Service&quot;), available at
                klone.live, you agree to be bound by these Terms of Service. If
                you do not agree, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                2. Description of Service
              </h2>
              <p>
                Klone is a social media management platform that allows users to
                create, schedule, and publish content across multiple social
                media platforms including TikTok, Facebook, Instagram, X
                (Twitter), LinkedIn, and YouTube. The Service also provides
                analytics, insights, and comment management features.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                3. Account Registration
              </h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>You must provide accurate and complete registration information</li>
                <li>You are responsible for maintaining the security of your account credentials</li>
                <li>You must be at least 13 years old to use the Service</li>
                <li>You are responsible for all activities under your account</li>
                <li>You must notify us immediately of any unauthorized use of your account</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                4. Social Media Account Connections
              </h2>
              <p>
                When you connect third-party social media accounts to Klone:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>You authorize us to access and use those accounts according to the permissions you grant</li>
                <li>You are responsible for ensuring you have the right to connect and publish content through those accounts</li>
                <li>We will only perform actions you explicitly request (posting, scheduling, etc.)</li>
                <li>You can disconnect any account at any time from your dashboard</li>
                <li>We are not responsible for any actions taken by the third-party platforms</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                5. User Content
              </h2>
              <p>
                You retain ownership of all content you create, upload, or
                publish through Klone. By using the Service, you grant us a
                limited license to:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Store your content on our servers</li>
                <li>Transmit your content to connected social media platforms</li>
                <li>Display your content within the Klone dashboard</li>
              </ul>
              <p className="mt-2">You are solely responsible for:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>The content you create and publish</li>
                <li>Ensuring your content does not violate any laws or third-party rights</li>
                <li>Complying with each social media platform&apos;s terms of service and community guidelines</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                6. Prohibited Conduct
              </h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Use the Service for any illegal purpose</li>
                <li>Publish spam, misleading, or harmful content</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Interfere with or disrupt the Service</li>
                <li>Scrape or collect data from our platform without permission</li>
                <li>Use the Service to violate the terms of any connected social media platform</li>
                <li>Share your account credentials with others</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                7. Service Availability
              </h2>
              <p>
                We strive to maintain high availability of the Service, but we
                do not guarantee uninterrupted access. The Service may be
                temporarily unavailable for maintenance, updates, or due to
                factors beyond our control. We are not liable for any loss or
                damage resulting from service interruptions.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                8. Limitation of Liability
              </h2>
              <p>
                To the maximum extent permitted by law, Klone shall not be
                liable for any indirect, incidental, special, consequential, or
                punitive damages, including but not limited to loss of data,
                revenue, or profits, arising from your use of the Service.
              </p>
              <p className="mt-2">
                We are not responsible for any content that fails to publish,
                publishes incorrectly, or is removed by third-party platforms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                9. Account Termination
              </h2>
              <p>
                We reserve the right to suspend or terminate your account if you
                violate these Terms. You can delete your account at any time
                from your Settings page. Upon deletion, all your data will be
                permanently removed.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                10. Changes to Terms
              </h2>
              <p>
                We may update these Terms from time to time. We will notify you
                of significant changes by email or through the platform.
                Continued use of the Service after changes constitutes
                acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                11. Governing Law
              </h2>
              <p>
                These Terms shall be governed by and construed in accordance
                with applicable laws. Any disputes shall be resolved through
                good-faith negotiation first.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
                12. Contact Us
              </h2>
              <p>
                If you have any questions about these Terms, please contact us
                at:{" "}
                <a href="mailto:support@klone.live" className="text-accent hover:underline">
                  support@klone.live
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
