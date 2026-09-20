/**
 * Full-length legal document bodies for Settings → Legal.
 *
 * Deliberately kept out of translation.ts: that file is a flat table of
 * short UI strings, and these two documents alone would multiply its
 * size several times over for content that's read on two dedicated
 * pages, not looked up by key throughout the app. TermsOfServicePage
 * and PrivacyPolicyPage import this file (or legal/ar for Arabic)
 * directly based on the current i18n.language, while their surrounding
 * chrome (heading, back link, "last updated") still uses the normal
 * t() system in translation.ts.
 *
 * GENERAL TEMPLATE NOTICE: both documents below are a general SaaS
 * CRM product/legal template. They do not name a real legal entity,
 * address, or jurisdiction — those are left as bracketed placeholders
 * ([Company Legal Name], [Company Address], [Governing Jurisdiction],
 * [Support Email]) for the business to fill in. This template requires
 * review by qualified legal counsel before production use.
 */

export interface LegalSection {
  id: string;
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  templateNotice: string;
  intro: string[];
  sections: LegalSection[];
}

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  templateNotice:
    "This is a general product/legal template for a SaaS CRM product. It does not constitute legal advice and must be reviewed by qualified legal counsel, and completed with your company's actual legal name, address, and governing jurisdiction, before being relied on in production.",
  intro: [
    'These Terms of Service ("Terms") govern access to and use of Orbit CRM (the "Service"), provided by [Company Legal Name] ("we", "us", or "our"). By creating an account or otherwise using the Service, you agree to these Terms.',
  ],
  sections: [
    {
      id: "introduction",
      heading: "1. Introduction",
      body: [
        'Orbit CRM is a multi-tenant customer relationship management platform that lets a company (a "Customer") and its authorized users manage contacts, leads, and related business data. These Terms form a binding agreement between you and us for your use of the Service.',
      ],
    },
    {
      id: "acceptance",
      heading: "2. Acceptance of Terms",
      body: [
        "By registering for, accessing, or using the Service, you confirm that you have read, understood, and agree to be bound by these Terms and by our Privacy Policy. If you are accepting these Terms on behalf of a company or other legal entity, you represent that you have the authority to bind that entity.",
      ],
    },
    {
      id: "eligibility",
      heading: "3. Eligibility",
      body: [
        "You must be able to form a legally binding contract to use the Service. The Service is intended for business use by companies and their authorized personnel, not for personal, household, or consumer use.",
      ],
    },
    {
      id: "account-registration",
      heading: "4. Account Registration",
      body: [
        "To use the Service, you must register for an account by providing accurate and complete information, either directly or through a supported third-party sign-in provider. The person or company that first registers a company workspace is its initial account Owner and may invite additional users.",
      ],
    },
    {
      id: "account-security",
      heading: "5. Account Security",
      body: [
        "You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. Notify us promptly at [Support Email] if you suspect unauthorized access to your account.",
      ],
    },
    {
      id: "user-responsibilities",
      heading: "6. User Responsibilities",
      body: [
        "You are responsible for the accuracy of the information you submit to the Service, for ensuring your use of the Service complies with applicable law, and for the conduct of any user you invite into your company's workspace.",
      ],
    },
    {
      id: "acceptable-use",
      heading: "7. Acceptable Use",
      body: [
        "You agree to use the Service only for its intended business purpose of managing customer and business relationship data, and in a manner consistent with these Terms and all applicable laws and regulations.",
      ],
    },
    {
      id: "prohibited-activities",
      heading: "8. Prohibited Activities",
      body: [
        "Without limiting Section 7, you may not: reverse engineer or attempt to extract the source code of the Service except as permitted by law; probe, scan, or test the vulnerability of the Service without authorization; use the Service to store or transmit unlawful, infringing, or malicious content; interfere with or disrupt the integrity or performance of the Service; or attempt to gain unauthorized access to another Customer's data or workspace.",
      ],
    },
    {
      id: "customer-data",
      heading: "9. Customer Data",
      body: [
        '"Customer Data" means the contacts, leads, activities, and other business data your company submits to the Service. As between you and us, you retain all rights to your Customer Data. You grant us a limited right to host, process, and display Customer Data solely to provide and support the Service.',
        "Each company's Customer Data is logically isolated from every other company's data. You are responsible for ensuring you have the necessary rights and permissions to submit any personal or business data of third parties (such as your own contacts and leads) to the Service.",
      ],
    },
    {
      id: "intellectual-property",
      heading: "10. Intellectual Property",
      body: [
        "The Service, including its software, design, and underlying technology, is owned by us or our licensors and is protected by intellectual property laws. These Terms do not grant you any rights to our trademarks, logos, or branding.",
      ],
    },
    {
      id: "third-party-services",
      heading: "11. Third-Party Services / Integrations",
      body: [
        "The Service may allow you to sign in using, or otherwise interact with, third-party services (for example, third-party sign-in providers). Your use of any third-party service is governed by that provider's own terms and privacy policy, and we are not responsible for third-party services.",
      ],
    },
    {
      id: "service-availability",
      heading: "12. Service Availability",
      body: [
        "We aim to keep the Service available and performant but do not guarantee uninterrupted or error-free operation. The Service may be temporarily unavailable for maintenance, updates, or reasons outside our reasonable control.",
      ],
    },
    {
      id: "payments-subscriptions",
      heading: "13. Payments / Subscriptions",
      body: [
        "[Placeholder: describe applicable plans, fees, billing cycle, and renewal/cancellation terms if the Service is offered on a paid or subscription basis. If the Service is currently offered free of charge, state that here instead.]",
      ],
    },
    {
      id: "suspension-termination",
      heading: "14. Suspension and Termination",
      body: [
        "We may suspend or terminate access to the Service for any account that violates these Terms, poses a security risk, or as required by law. You may stop using the Service, or an account Owner may close a company's workspace, at any time.",
      ],
    },
    {
      id: "data-retention-deletion",
      heading: "15. Data Retention / Deletion",
      body: [
        "Following termination of your account or workspace, we retain Customer Data for a limited period as described in our Privacy Policy, after which it is deleted or anonymized, except where retention is required by law or for legitimate business purposes such as fraud prevention.",
      ],
    },
    {
      id: "disclaimer-warranties",
      heading: "16. Disclaimer of Warranties",
      body: [
        'The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement, to the fullest extent permitted by applicable law.',
      ],
    },
    {
      id: "limitation-liability",
      heading: "17. Limitation of Liability",
      body: [
        "To the fullest extent permitted by law, we will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, data, or goodwill, arising out of or related to your use of the Service.",
      ],
    },
    {
      id: "indemnification",
      heading: "18. Indemnification",
      body: [
        "You agree to indemnify and hold us harmless from any claims, damages, or expenses (including reasonable legal fees) arising from your misuse of the Service or your violation of these Terms.",
      ],
    },
    {
      id: "changes-to-terms",
      heading: "19. Changes to Terms",
      body: [
        "We may update these Terms from time to time. If we make material changes, we will provide reasonable notice, such as by posting an updated version within the Service or notifying account Owners. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.",
      ],
    },
    {
      id: "governing-law",
      heading: "20. Governing Law / Jurisdiction",
      body: [
        "[Placeholder: these Terms are governed by the laws of [Governing Jurisdiction], without regard to its conflict-of-laws principles, and any dispute will be subject to the exclusive jurisdiction of the courts located in [Governing Jurisdiction].]",
      ],
    },
    {
      id: "contact-information",
      heading: "21. Contact Information",
      body: [
        "Questions about these Terms can be sent to [Support Email] or [Company Address].",
      ],
    },
  ],
};

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  templateNotice:
    "This is a general privacy policy template describing Orbit CRM's actual current architecture (authentication, cookies, analytics, and error monitoring) as implemented at the time this template was written. It does not constitute legal advice and must be reviewed by qualified legal counsel, and completed with your company's actual legal name, address, and contact details, before being relied on in production.",
  intro: [
    'This Privacy Policy explains how [Company Legal Name] ("we", "us", or "our") collects, uses, and protects information in connection with Orbit CRM (the "Service").',
  ],
  sections: [
    {
      id: "introduction",
      heading: "1. Introduction",
      body: [
        "This Policy applies to information collected through the Service, including account information you provide and business data your company stores in the Service.",
      ],
    },
    {
      id: "information-we-collect",
      heading: "2. Information We Collect",
      body: [
        "We collect the categories of information described in this section: account information, the business/CRM data you submit, usage data, and device/technical information.",
      ],
    },
    {
      id: "account-information",
      heading: "3. Account Information",
      body: [
        "When you register, we collect your first and last name, email address, and password (stored only as a secure hash, never in plain text). You may optionally provide a phone number and a profile avatar. If you sign in through a third-party provider (Google, Facebook, or Microsoft), we receive the basic profile information that provider shares with us (typically your name, email address, and profile photo).",
      ],
    },
    {
      id: "business-crm-data",
      heading: "4. Business / CRM Data",
      body: [
        "Your company's account Owner and authorized users may enter business data into the Service, such as contacts, leads, and related activity records. This data belongs to your company; we process it on your company's behalf to provide the Service, and each company's data is logically isolated from every other company's data.",
      ],
    },
    {
      id: "usage-data",
      heading: "5. Usage Data",
      body: [
        "We collect information about how the Service is used — such as which features are opened and general interaction patterns — through our analytics provider, described in the Analytics section below, to help us understand and improve the Service.",
      ],
    },
    {
      id: "device-technical-information",
      heading: "6. Device / Technical Information",
      body: [
        "We and our service providers may automatically collect technical information such as IP address, browser type, and device information, including through the error-monitoring and analytics tools described below.",
      ],
    },
    {
      id: "cookies",
      heading: "7. Cookies / Similar Technologies",
      body: [
        "The Service uses a small number of strictly functional cookies to keep you signed in: an HttpOnly session cookie carrying your login state, an HttpOnly refresh cookie used to renew it, and a separate, non-HttpOnly cookie used only to protect state-changing requests against cross-site request forgery. None of these are used for advertising. Our analytics provider (see Analytics below) may separately set its own cookies or use browser storage, in accordance with its own configuration, to recognize your browser across sessions.",
      ],
    },
    {
      id: "how-we-use-information",
      heading: "8. How We Use Information",
      body: [
        "We use the information described above to provide, maintain, and secure the Service; authenticate you and keep your session working; respond to support requests; send account-related emails such as email verification and password-reset messages; monitor and fix errors; and understand aggregate usage patterns to improve the Service.",
      ],
    },
    {
      id: "legal-bases",
      heading: "9. Legal Bases",
      body: [
        "[Placeholder: where applicable law requires a stated legal basis for processing (for example, under the EU/UK GDPR), we rely on: performance of a contract with you (providing the Service), our legitimate interests (such as securing and improving the Service), and, where required, your consent.]",
      ],
    },
    {
      id: "data-sharing",
      heading: "10. Data Sharing",
      body: [
        "We do not sell your personal information. We share information only with the service providers described in this Policy (who process it on our behalf to help us run the Service), when required by law, or in connection with a merger, acquisition, or similar business transaction, subject to standard confidentiality protections.",
      ],
    },
    {
      id: "third-party-services",
      heading: "11. Third-Party Services",
      body: [
        "The Service relies on a small number of third-party service providers, described in the sections below, to operate: authentication providers, an analytics provider, and an error-monitoring provider. We do not use these integrations to display advertising to you.",
      ],
    },
    {
      id: "authentication-providers",
      heading: "12. Authentication Providers",
      body: [
        "If you choose to sign in with Google, Facebook, or Microsoft instead of a password, that provider authenticates you and shares your basic profile information with us as described in Account Information above. Your use of those providers is also subject to their own privacy policies.",
      ],
    },
    {
      id: "analytics",
      heading: "13. Analytics",
      body: [
        "We use PostHog, a product analytics provider, to understand how the Service is used and to improve it. We configure PostHog not to receive sensitive fields such as your name, email, phone number, or the business data stored in your workspace — only non-identifying interaction events (for example, that a Settings section was opened) and, where relevant, non-sensitive event properties such as your selected interface language.",
      ],
    },
    {
      id: "error-monitoring",
      heading: "14. Error Monitoring",
      body: [
        "We use Sentry, an error-monitoring provider, to detect and diagnose technical errors in the Service. Sentry is configured not to collect personally identifiable request data by default.",
      ],
    },
    {
      id: "data-security",
      heading: "15. Data Security",
      body: [
        "We use technical measures such as encrypted password storage, HttpOnly authentication cookies, and cross-site request forgery protections on state-changing requests to help protect your information. No method of storage or transmission is completely secure, and we cannot guarantee absolute security.",
      ],
    },
    {
      id: "data-retention",
      heading: "16. Data Retention",
      body: [
        "We retain account and business data for as long as your company's workspace remains active, and for a limited period after account or workspace closure as described in our Terms of Service, except where a longer period is required by law or for legitimate business purposes such as fraud prevention.",
      ],
    },
    {
      id: "data-deletion",
      heading: "17. Data Deletion",
      body: [
        "You may request deletion of your personal information or your company's business data, subject to the account Owner's authority over company workspace data and any retention we are legally required to maintain, by contacting us at [Support Email].",
      ],
    },
    {
      id: "user-rights",
      heading: "18. User Rights",
      body: [
        "Depending on your location, you may have rights to access, correct, delete, or export your personal information, and to object to or restrict certain processing. You can update much of your account information directly within the Service, or contact us at [Support Email] for other requests.",
      ],
    },
    {
      id: "international-transfers",
      heading: "19. International Data Transfers",
      body: [
        "[Placeholder: describe where the Service's infrastructure and service providers are located, and the safeguards used (such as standard contractual clauses) if personal information is transferred internationally.]",
      ],
    },
    {
      id: "childrens-privacy",
      heading: "20. Children's Privacy",
      body: [
        "The Service is intended for business use by adults and is not directed to children. We do not knowingly collect personal information from children.",
      ],
    },
    {
      id: "changes-to-policy",
      heading: "21. Changes to Privacy Policy",
      body: [
        "We may update this Policy from time to time. If we make material changes, we will provide reasonable notice, such as by posting an updated version within the Service or notifying account Owners.",
      ],
    },
    {
      id: "contact-information",
      heading: "22. Contact Information",
      body: [
        "Questions about this Policy, or requests regarding your information, can be sent to [Support Email] or [Company Address].",
      ],
    },
  ],
};
