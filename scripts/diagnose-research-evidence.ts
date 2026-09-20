/**
 * NexaMOS Forensic Trace Script:
 * Diagnosa Mengapa Direct URL Research Menghasilkan SUPPORTED: 0
 *
 * Sesuai panduan investigasi forensik:
 * - Tidak mengubah threshold verifikasi
 * - Tidak mengubah prompt Qwen
 * - Tidak menambahkan data sintetis
 * - Menjalankan komponen riil produksi langkah demi langkah
 */

import { HttpSourceAcquisitionProvider } from '../engines/research/acquisition/providers/http-source-acquisition-provider.ts';
import { ResearchIngestionService } from '../engines/research/ingestion/research-ingestion-service.ts';
import { InMemoryResearchSourceRepository } from '../engines/research/repository/in-memory-research-source-repository.ts';
import { InMemoryResearchEvidenceRepository } from '../engines/research/repository/in-memory-research-evidence-repository.ts';
import { InMemoryResearchEventRepository } from '../engines/research/repository/in-memory-research-event-repository.ts';
import { EvidenceIntegrityValidator } from '../engines/research/evidence-integrity-validator.ts';
import { DeterministicClaimEvidenceVerifier } from '../engines/research/claim-evidence-verifier.ts';
import { CanonicalResearchPipeline } from '../engines/research/canonical-research-pipeline.ts';
import { AIProviderFactory } from '../infrastructure/ai/ai-provider-factory.ts';
import { ensureEnvLoaded, isAIConfigured } from '../infrastructure/ai/ai-provider-config.ts';
import type { SourceCandidate } from '../engines/research/acquisition/source-candidate.ts';
import type { Topic } from '../engines/ideation/domain/topic.types.ts';
import type { ResearchClaim } from '../engines/research/domain/research-claim.ts';
import type { ResearchEvidence } from '../engines/research/domain/research-evidence.ts';

const STOP_WORDS = new Set([
  'yang', 'di', 'ke', 'dari', 'dan', 'atau', 'pada', 'adalah', 'itu', 'ini',
  'untuk', 'dengan', 'dalam', 'bisa', 'dapat', 'akan', 'telah', 'sudah',
  'the', 'is', 'at', 'which', 'on', 'and', 'or', 'in', 'to', 'for', 'of',
  'with', 'a', 'an', 'as', 'by', 'that', 'this', 'are', 'was', 'were'
]);

function tokenize(text: string): Set<string> {
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(clean);
}

function extractNumbers(text: string): string[] {
  const matches = text.match(/\b\d+(?:[.,]\d+)?%?\b/g);
  return matches ? matches.map((m) => m.replace(',', '.')) : [];
}

async function runForensicTrace() {
  ensureEnvLoaded();

  const targetTopic = 'Teknik pemasaran konten di era AI';
  const targetUrl = 'https://contentmarketinginstitute.com/ai-content-creation-tools/how-to-work-ai-into-content-marketing-in-a-way-that-works-for-you';
  const projectId = `proj-forensic-${Date.now().toString(36)}`;

  console.log('================================================================');
  console.log('NEXAMOS FORENSIC TRACE — DIRECT URL RESEARCH INVESTIGATION');
  console.log('================================================================');
  console.log(`Topic      : ${targetTopic}`);
  console.log(`Direct URL : ${targetUrl}`);
  console.log(`Project ID : ${projectId}`);
  console.log(`AI Ready   : ${isAIConfigured() ? 'YES (Live Qwen / Real AI Provider)' : 'NO'}`);
  console.log('----------------------------------------------------------------\n');

  // =========================================================================
  // PHASE 2 — SOURCE ACQUISITION TRACE
  // =========================================================================
  console.log('>>> [PHASE 2] EXECUTING HttpSourceAcquisitionProvider...');
  const acquisitionProvider = new HttpSourceAcquisitionProvider();
  const candidate: SourceCandidate = {
    id: 'cand-direct-1',
    queryId: 'rq-1',
    researchProjectId: projectId,
    url: targetUrl,
    title: targetTopic,
    provider: 'DIRECT_INPUT',
    discoveredAt: new Date().toISOString(),
    status: 'DISCOVERED'
  };

  const acqStart = Date.now();
  const acqResult = await acquisitionProvider.acquire(candidate, { timeoutMs: 20000 });
  const acqDuration = Date.now() - acqStart;

  if (!acqResult.ok) {
    console.error('ACQUISITION FAILED!');
    console.error('Error Code    :', acqResult.error.code);
    console.error('Error Message :', acqResult.error.message);
    console.error('Error Details :', acqResult.error.details);
    console.log('\nCLASSIFICATION:');
    console.log('ACQUISITION: FAIL');
    console.log('FIRST_FAILURE_POINT: SOURCE_ACQUISITION_FAILURE');
    return;
  }

  const rawInput = acqResult.value;
  console.log('ACQUISITION: PASS');
  console.log(`requestedUrl         : ${targetUrl}`);
  console.log(`finalUrl             : ${rawInput.url}`);
  console.log(`HTTP status          : ${rawInput.metadata?.statusCode ?? 200}`);
  console.log(`contentType          : ${rawInput.metadata?.contentType ?? 'unknown'}`);
  console.log(`publisher            : ${rawInput.publisher ?? 'N/A'}`);
  console.log(`page title           : ${rawInput.title ?? 'N/A'}`);
  console.log(`retrievedAt          : ${new Date().toISOString()} (${acqDuration}ms)`);
  console.log(`rawResponseLength    : ${rawInput.content.length} characters`);

  // =========================================================================
  // PHASE 3 — CONTENT EXTRACTION & EVIDENCE CANDIDATES
  // =========================================================================
  console.log('\n>>> [PHASE 3] EXECUTING ResearchIngestionService...');
  const sourceRepo = new InMemoryResearchSourceRepository();
  const evidenceRepo = new InMemoryResearchEvidenceRepository();
  const eventRepo = new InMemoryResearchEventRepository();
  const ingestionService = new ResearchIngestionService({ sourceRepo, evidenceRepo, eventRepo });

  const ingestResult = await ingestionService.ingest(rawInput, { extractEvidence: true });
  if (!ingestResult.ok) {
    console.error('INGESTION FAILED!');
    console.error('Error Code    :', ingestResult.error.code);
    console.error('Error Message :', ingestResult.error.message);
    console.log('\nCLASSIFICATION:');
    console.log('CONTENT EXTRACTION: FAIL');
    console.log('FIRST_FAILURE_POINT: CONTENT_EXTRACTION_FAILURE');
    return;
  }

  const acquiredSource = ingestResult.value.source;
  const normalizedDoc = ingestResult.value.normalizedDocument;
  const rawEvidenceCandidates = ingestResult.value.persistedEvidence || [];

  console.log(`Ingested Source Title: "${acquiredSource.title}"`);
  console.log(`Ingested Source Pub  : "${acquiredSource.publisher}"`);
  console.log(`Total Sections       : ${normalizedDoc?.sections?.length ?? 0}`);
  console.log(`Total Tables         : ${normalizedDoc?.tables?.length ?? 0}`);
  console.log(`totalEvidenceCandidates : ${rawEvidenceCandidates.length}`);

  // Tampilkan first ~1500 chars of extracted text
  const allText = (normalizedDoc?.sections || []).map((s) => s.text).join('\n\n');
  console.log(`extractedTextLength  : ${allText.length} characters`);
  console.log('\n--- FIRST 1500 CHARACTERS OF EXTRACTED ARTICLE TEXT ---');
  console.log(allText.slice(0, 1500));
  console.log('--- END OF SAMPLE EXTRACTED TEXT ---\n');

  // Periksa juga apakah ada string spesifik artikel di raw HTML vs normalized text
  console.log('--- RAW HTML KEYWORD AUDIT ---');
  console.log('raw content length              :', rawInput.content.length);
  console.log('contains "work AI into content"  :', rawInput.content.toLowerCase().includes('work ai into content'));
  console.log('contains "content marketing"     :', rawInput.content.toLowerCase().includes('content marketing'));
  console.log('contains "generative ai"         :', rawInput.content.toLowerCase().includes('generative ai'));
  console.log('contains "article-body" or main  :', /<article|<main|class="[^"]*article/i.test(rawInput.content));

  const isContentPass = allText.length > 500 && !allText.includes('Please enable JavaScript');
  console.log(`CONTENT EXTRACTION: ${isContentPass ? 'PASS' : 'FAIL'}`);

  console.log('\n--- FIRST UP TO 10 EVIDENCE CANDIDATES ---');
  for (let i = 0; i < Math.min(10, rawEvidenceCandidates.length); i++) {
    const ev = rawEvidenceCandidates[i];
    console.log(`[#${i + 1}] ID: ${ev.id} | Type: ${ev.candidateType || (ev as any).evidenceType || 'TEXT'} | Source: ${ev.sourceId}`);
    console.log(`     Quote: "${ev.content.slice(0, 160)}..."`);
    console.log(`     Verified before integrity check: ${ev.verified}`);
  }

  // =========================================================================
  // PHASE 4 — EVIDENCE INTEGRITY TRACE
  // =========================================================================
  console.log('\n>>> [PHASE 4] EXECUTING EvidenceIntegrityValidator...');
  const integrityValidator = new EvidenceIntegrityValidator();
  const verifiedEvidenceList: ResearchEvidence[] = [];
  const rejectedEvidenceList: Array<{ ev: ResearchEvidence; check: any }> = [];

  for (const ev of rawEvidenceCandidates) {
    const check = integrityValidator.validate({
      evidence: ev,
      source: acquiredSource,
      sourceRawContent: rawInput.content
    });

    if (check.verified) {
      verifiedEvidenceList.push({
        ...ev,
        verified: true,
        provenanceType: check.provenanceType,
        sourceUrl: acquiredSource.url || null
      });
    } else {
      rejectedEvidenceList.push({ ev, check });
    }
  }

  console.log(`evidenceCandidatesTotal : ${rawEvidenceCandidates.length}`);
  console.log(`verifiedEvidenceTotal   : ${verifiedEvidenceList.length}`);
  console.log(`rejectedEvidenceTotal   : ${rejectedEvidenceList.length}`);
  console.log(`EVIDENCE INTEGRITY: ${verifiedEvidenceList.length > 0 ? 'PASS' : 'FAIL'}`);

  if (rejectedEvidenceList.length > 0) {
    console.log('\nSample Rejected Evidence (Up to 5):');
    for (let i = 0; i < Math.min(5, rejectedEvidenceList.length); i++) {
      const { ev, check } = rejectedEvidenceList[i];
      console.log(`  - [${ev.id}] Reason: ${check.reason} | Issues: ${check.issues.join(', ')}`);
      console.log(`    Snippet: "${ev.content.slice(0, 100)}..."`);
    }
  }

  console.log('\nSample Verified Evidence (Up to 10):');
  for (let i = 0; i < Math.min(10, verifiedEvidenceList.length); i++) {
    const ev = verifiedEvidenceList[i];
    console.log(`  * [${ev.id}] verified: ${ev.verified} | type: ${ev.provenanceType}`);
    console.log(`    URL: ${ev.sourceUrl}`);
    console.log(`    Content: "${ev.content.slice(0, 180)}..."`);
  }

  if (verifiedEvidenceList.length === 0) {
    console.log('\nCLASSIFICATION: FIRST_FAILURE_POINT: EVIDENCE_INTEGRITY_REJECTION');
    return;
  }

  // =========================================================================
  // PHASE 5 — QWEN CLAIM PROPOSAL TRACE
  // =========================================================================
  console.log('\n>>> [PHASE 5] EXECUTING Qwen proposeClaims()...');
  const prodProviders = AIProviderFactory.createProductionProviders();
  const aiResearchProvider = prodProviders.researchProvider;

  const questions = [
    {
      id: 'rq-1',
      question: `Data empiris, arsitektur sistem, dan dinamika pasar mengenai ${targetTopic}`,
      priority: 'HIGH' as const,
      status: 'OPEN' as const
    }
  ];

  const proposalResult = await aiResearchProvider.proposeClaims({
    projectId,
    evidence: verifiedEvidenceList.slice(0, 20),
    questions
  });

  if (!proposalResult.ok) {
    console.error('CLAIM PROPOSAL FAILED:', proposalResult.error);
    console.log('CLASSIFICATION: FIRST_FAILURE_POINT: CLAIM_PROPOSAL_MISMATCH');
    return;
  }

  const rawProposedClaims = proposalResult.value;
  console.log(`Total Proposed Claims by Qwen: ${rawProposedClaims.length}`);

  for (let i = 0; i < rawProposedClaims.length; i++) {
    const c = rawProposedClaims[i];
    console.log(`\n[PROPOSED CLAIM #${i + 1}]`);
    console.log(`Statement   : "${c.statement}"`);
    console.log(`Claim Type  : ${c.claimType}`);
    console.log(`Importance  : ${c.importance}`);
    console.log(`Rationale   : ${c.rationale || 'N/A'}`);
  }

  // =========================================================================
  // PHASE 6 & 7 — CLAIM VERIFIER FORENSIC TRACE & SIDE-BY-SIDE
  // =========================================================================
  console.log('\n================================================================');
  console.log('>>> [PHASE 6 & 7] DETERMINISTIC VERIFIER FORENSIC AUDIT');
  console.log('================================================================');

  const claimVerifier = new DeterministicClaimEvidenceVerifier();
  const supportedClaims: ResearchClaim[] = [];
  const unverifiedClaims: ResearchClaim[] = [];
  const unsupportedClaims: ResearchClaim[] = [];

  for (let idx = 0; idx < rawProposedClaims.length; idx++) {
    const pc = rawProposedClaims[idx];
    const claim: ResearchClaim = {
      id: `claim-${idx + 1}`,
      researchProjectId: projectId,
      statement: pc.statement.trim(),
      claimType: pc.claimType || 'FACTUAL',
      importance: pc.importance || 'CRITICAL',
      status: 'UNVERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Jalankan verifier produksi aktual
    const verifyRes = await claimVerifier.verify(claim, verifiedEvidenceList);
    claim.status = verifyRes.status;

    // Hitung metrik leksikal detail terhadap SETIAP bukti untuk mendiagnosis
    const claimWords = tokenize(claim.statement);
    const claimNumbers = extractNumbers(claim.statement);

    let bestEvidence: ResearchEvidence | null = null;
    let maxOverlapRatio = -1;
    let bestOverlapWords: string[] = [];

    for (const ev of verifiedEvidenceList) {
      const evWords = tokenize(ev.content);
      let overlapCount = 0;
      const matchedWords: string[] = [];
      for (const w of claimWords) {
        if (evWords.has(w)) {
          overlapCount++;
          matchedWords.push(w);
        }
      }
      const overlapRatio = claimWords.size > 0 ? overlapCount / claimWords.size : 0;
      if (overlapRatio > maxOverlapRatio) {
        maxOverlapRatio = overlapRatio;
        bestEvidence = ev;
        bestOverlapWords = matchedWords;
      }
    }

    console.log(`\n----------------------------------------------------------------`);
    console.log(`CLAIM ID       : ${claim.id}`);
    console.log(`CLAIM TEXT     : "${claim.statement}"`);
    console.log(`FINAL STATUS   : ${claim.status}`);
    console.log(`VERIFIER REASON: ${verifyRes.reason}`);
    console.log(`SUPPORTING EVIDENCES COUNT: ${verifyRes.supportingEvidenceIds.length}`);
    console.log(`CANDIDATE EVIDENCES EVALUATED: ${verifiedEvidenceList.length}`);

    if (bestEvidence) {
      console.log(`BEST CANDIDATE EVIDENCE ID   : ${bestEvidence.id}`);
      console.log(`BEST CANDIDATE EVIDENCE TEXT : "${bestEvidence.content.slice(0, 200)}..."`);
      console.log(`MATCHING METRICS:`);
      console.log(`  - Claim Words Count  : ${claimWords.size} -> [${Array.from(claimWords).join(', ')}]`);
      console.log(`  - Overlap Words Count: ${bestOverlapWords.length} -> [${bestOverlapWords.join(', ')}]`);
      console.log(`  - Token Overlap Ratio: ${(maxOverlapRatio * 100).toFixed(2)}%`);
      console.log(`  - Minimum Threshold  : 25% (qualifying), 35% (supporting)`);
      console.log(`  - Claim Numbers      : [${claimNumbers.join(', ')}]`);
      const evNumbers = extractNumbers(bestEvidence.content);
      console.log(`  - Evidence Numbers   : [${evNumbers.join(', ')}]`);
      const numMatch = claimNumbers.length === 0 || claimNumbers.some((num) => evNumbers.includes(num));
      console.log(`  - Numeric Match      : ${numMatch ? 'YES' : 'NO'}`);
    }

    if (claim.status === 'SUPPORTED') {
      supportedClaims.push(claim);
    } else if (claim.status === 'PARTIALLY_SUPPORTED' || claim.status === 'UNVERIFIED') {
      unverifiedClaims.push(claim);
    } else {
      unsupportedClaims.push(claim);
    }
  }

  // =========================================================================
  // PHASE 8 — RESEARCHBRIEF TRACE
  // =========================================================================
  console.log('\n================================================================');
  console.log('>>> [PHASE 8] FINAL RESEARCHBRIEF TRACE');
  console.log('================================================================');
  console.log(`sources              : 1 (${acquiredSource.url})`);
  console.log(`evidenceCandidates   : ${rawEvidenceCandidates.length}`);
  console.log(`verifiedEvidence     : ${verifiedEvidenceList.length}`);
  console.log(`proposedClaims       : ${rawProposedClaims.length}`);
  console.log(`supportedClaims      : ${supportedClaims.length}`);
  console.log(`unverifiedClaims     : ${unverifiedClaims.length}`);
  console.log(`unsupportedClaims    : ${unsupportedClaims.length}`);
  const readiness = supportedClaims.length > 0 ? 'READY_FOR_EDITORIAL' : 'INSUFFICIENT_EVIDENCE';
  console.log(`readiness            : ${readiness}`);
  console.log(`errorCode            : ${readiness === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT_EVIDENCE' : 'NONE'}`);

  console.log('\n================================================================');
  console.log('>>> DIAGNOSTIC COMPLETE');
  console.log('================================================================');
}

runForensicTrace().catch((err) => {
  console.error('Fatal error during forensic trace:', err);
  process.exit(1);
});
