import { signPayload, verifyPayload } from "@/lib/crypto";
import { maskApaar } from "@/lib/mask";

export const ISSUER_DID = "did:web:sutra.aicte.demo";
export const PUBLIC_KEY_ID = `${ISSUER_DID}#ed25519-1`;

export interface CredentialInput {
  recordId: string;
  apaarId: string;
  apaarHash: string;
  institution: string;
  program: string;
  admissionYear: number;
  expectedCompletion: number;
  status: string;
  issuedAt: string;
  expiresAt: string;
  baseUrl: string;
}

export interface SignedCredential {
  "@context": string[];
  id: string;
  type: string[];
  issuer: { id: string; name: string };
  issuanceDate: string;
  expirationDate: string;
  credentialSubject: Record<string, unknown>;
  credentialStatus: { id: string; type: string };
  proof: { type: string; created: string; verificationMethod: string; proofPurpose: string; signatureValue: string };
}

export function issueCredential(input: CredentialInput): SignedCredential {
  const unsigned = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `urn:sutra:credential:${input.recordId}`,
    type: ["VerifiableCredential", "EnrolmentCredential"],
    issuer: { id: ISSUER_DID, name: "Sutra (AICTE Central Repository)" },
    issuanceDate: input.issuedAt,
    expirationDate: input.expiresAt,
    credentialSubject: {
      apaarIdMasked: maskApaar(input.apaarId),
      apaarHashRef: input.apaarHash.slice(0, 16),
      institution: input.institution,
      program: input.program,
      admissionYear: input.admissionYear,
      expectedCompletion: input.expectedCompletion,
      status: input.status,
    },
    credentialStatus: { id: `${input.baseUrl}/api/v1/credentials/${input.recordId}`, type: "SutraRevocationCheck" },
  };
  return {
    ...unsigned,
    proof: {
      type: "Ed25519Signature2020",
      created: input.issuedAt,
      verificationMethod: PUBLIC_KEY_ID,
      proofPurpose: "assertionMethod",
      signatureValue: signPayload(unsigned),
    },
  };
}

export function verifyCredential(credential: SignedCredential, publicKeyPem?: string): boolean {
  const { proof, ...unsigned } = credential;
  if (!proof?.signatureValue) return false;
  return verifyPayload(unsigned, proof.signatureValue, publicKeyPem);
}
