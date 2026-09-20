/**
 * Live Smoke Test: Tavily Research Search Provider
 *
 * Menguji integrasi live Tavily Search API dengan kuota hemat (maxResults: 3, basic depth)
 * dan memvalidasi alur akuisisi sumber serta penegakan integritas bukti/klaim.
 *
 * JANGAN MENAMPILKAN ATAU MENCETAK API KEY.
 */

import { TavilyResearchSearchProvider } from '../engines/research/acquisition/providers/tavily-research-search-provider.ts';
import { HttpSourceAcquisitionProvider } from '../engines/research/acquisition/providers/http-source-acquisition-provider.ts';
import { ResearchIngestionService } from '../engines/research/ingestion/research-ingestion-service.ts';
import { InMemoryResearchSourceRepository } from '../engines/research/repository/in-memory-research-source-repository.ts';
import { InMemoryResearchEvidenceRepository } from '../engines/research/repository/in-memory-research-evidence-repository.ts';
import { InMemoryResearchEventRepository } from '../engines/research/repository/in-memory-research-event-repository.ts';
import { EvidenceIntegrityValidator } from '../engines/research/evidence-integrity-validator.ts';
import { DeterministicClaimEvidenceVerifier } from '../engines/research/claim-evidence-verifier.ts';
import type { SourceCandidate } from '../engines/research/acquisition/source-candidate.ts';
import type { ResearchClaim } from '../engines/research/domain/research-claim.ts';
import type { ResearchEvidence } from '../engines/research/domain/research-evidence.ts';
import { ensureEnvLoaded } from '../infrastructure/ai/ai-provider-config.ts';

async function runLiveSmokeTest(): Promise<void> {
  ensureEnvLoaded();

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.error('❌ [ERROR] TAVILY_API_KEY tidak ditemukan di environment (.env.local).');
    process.exit(1);
  }

  const query = 'How artificial intelligence is changing CRM systems';

  console.log('========================================================');
  console.log('🚀 NexaMOS Research Agent — Live Tavily Smoke Test');
  console.log('========================================================');
  console.log(`📌 Research Query:     "${query}"`);
  console.log('🛡️  Mode:               Basic Search Depth (Hemat Kuota)');
  console.log('🛡️  API Key:            Tersedia & Terproteksi (Hidden)');
  console.log('--------------------------------------------------------');

  // 1. Eksekusi Pencarian Live Tavily
  const searchProvider = new TavilyResearchSearchProvider();
  console.log('📡 Menghubungi Tavily Search API...');
  
  const startTime = Date.now();
  const searchResults = await searchProvider.search(query, { maxResults: 3, timeoutMs: 20000 });
  const duration = Date.now() - startTime;

  console.log(`✅ Pencarian selesai dalam ${duration}ms.`);
  console.log(`📊 Jumlah Hasil Ditemukan: ${searchResults.length}`);
  console.log('\n🌐 Domain Sumber yang Ditemukan:');
  searchResults.forEach((r, idx) => {
    console.log(`  [${idx + 1}] Domain:    ${r.publisher || 'N/A'}`);
    console.log(`      Title:     ${r.title}`);
    console.log(`      URL:       ${r.url}`);
    console.log(`      Published: ${r.publishedAt || '(tidak dicantumkan)'}`);
  });

  if (searchResults.length === 0) {
    console.warn('⚠️ Tidak ada hasil ditemukan dari Tavily.');
    return;
  }

  // 2. Menguji Akuisisi Sumber Primer (Mengambil 1 URL pertama)
  console.log('\n--------------------------------------------------------');
  console.log('📥 Menguji Akuisisi Sumber Primer via HttpSourceAcquisitionProvider...');

  const firstResult = searchResults[0];
  const candidate: SourceCandidate = {
    id: 'cand-smoke-01',
    queryId: 'rq-smoke-01',
    researchProjectId: 'proj-smoke-tavily',
    title: firstResult.title,
    url: firstResult.url,
    snippet: firstResult.snippet,
    publisher: firstResult.publisher,
    provider: 'TavilyResearchSearchProvider',
    rank: 1,
    status: 'DISCOVERED',
    discoveredAt: new Date().toISOString()
  };

  const acquisitionProvider = new HttpSourceAcquisitionProvider();
  const sourceRepo = new InMemoryResearchSourceRepository();
  const evidenceRepo = new InMemoryResearchEvidenceRepository();
  const eventRepo = new InMemoryResearchEventRepository();
  const ingestionService = new ResearchIngestionService({ sourceRepo, evidenceRepo, eventRepo });

  const acquireResult = await acquisitionProvider.acquire(candidate, { timeoutMs: 15000 });
  const acquisitionSuccess = acquireResult.ok;
  console.log(`🌐 Status Akuisisi URL [${candidate.url}]: ${acquisitionSuccess ? 'BERHASIL (HTTP 200)' : 'GAGAL / BLOCKED'}`);

  let candidateEvidenceCount = 0;
  let verifiedEvidenceCount = 0;
  const verifiedEvidenceList: ResearchEvidence[] = [];

  if (acquisitionSuccess) {
    const rawInput = {
      ...acquireResult.value,
      researchProjectId: 'proj-smoke-tavily'
    };
    const ingestResult = await ingestionService.ingest(rawInput, { extractEvidence: true });

    if (ingestResult.ok) {
      const persistedEv = ingestResult.value.persistedEvidence || [];
      candidateEvidenceCount = persistedEv.length;

      const integrityValidator = new EvidenceIntegrityValidator();
      for (const ev of persistedEv) {
        const check = integrityValidator.validate({
          evidence: ev,
          source: ingestResult.value.source,
          sourceRawContent: acquireResult.value.content
        });
        if (check.verified) {
          verifiedEvidenceCount++;
          verifiedEvidenceList.push(ev);
        }
      }
    }
  }

  console.log(`📑 Evidence Candidate Diekstrak: ${candidateEvidenceCount}`);
  console.log(`🔍 Verified Evidence Terkonfirmasi: ${verifiedEvidenceCount}`);

  // 3. Menguji Verifikasi Klaim
  console.log('\n--------------------------------------------------------');
  console.log('⚖️  Menguji Verifikasi Klaim Deterministik (DeterministicClaimEvidenceVerifier)...');

  const claimVerifier = new DeterministicClaimEvidenceVerifier();
  
  // Skenario Klaim 1: Hipotesis yang diusulkan
  const proposedClaim1: ResearchClaim = {
    id: 'claim-smoke-01',
    statement: firstResult.snippet
      ? firstResult.snippet.slice(0, 100)
      : 'Artificial intelligence enhances CRM automation and customer workflows',
    claimType: 'FACTUAL',
    importance: 'CRITICAL',
    status: 'SUPPORTED', // Model mengajukan SUPPORTED
    researchProjectId: 'proj-smoke-tavily',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const verificationRes1 = await claimVerifier.verify(proposedClaim1, verifiedEvidenceList);
  console.log(`📌 Klaim #1: "${proposedClaim1.statement.slice(0, 70)}..."`);
  console.log(`   Status Hasil Verifikasi Gate: ${verificationRes1.status}`);
  console.log(`   Alasan: ${verificationRes1.reason}`);

  // Skenario Klaim 2: Klaim tanpa bukti pendukung
  const proposedClaim2: ResearchClaim = {
    id: 'claim-smoke-02',
    statement: 'Sistem CRM bertenaga AI mampu membaca pikiran pengguna secara langsung',
    claimType: 'FORECAST',
    importance: 'SUPPORTING',
    status: 'SUPPORTED', // Model mencoba mengklaim SUPPORTED tanpa bukti
    researchProjectId: 'proj-smoke-tavily',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const verificationRes2 = await claimVerifier.verify(proposedClaim2, verifiedEvidenceList);
  console.log(`📌 Klaim #2 (Klaim Mengada-ada): "${proposedClaim2.statement.slice(0, 70)}..."`);
  console.log(`   Status Hasil Verifikasi Gate: ${verificationRes2.status}`);
  console.log(`   Alasan: ${verificationRes2.reason}`);

  const supportedClaimCount = [verificationRes1, verificationRes2].filter((c) => c.status === 'SUPPORTED').length;

  // 4. Laporan Ringkasan Smoke Test
  console.log('\n========================================================');
  console.log('📋 RINGKASAN HASIL LIVE SMOKE TEST');
  console.log('========================================================');
  console.log(`1. Query:                     "${query}"`);
  console.log(`2. Jumlah Search Result:      ${searchResults.length}`);
  console.log(`3. Domain Terdeteksi:         ${searchResults.map((r) => r.publisher).filter(Boolean).join(', ')}`);
  console.log(`4. Status Akuisisi Web:       ${acquisitionSuccess ? 'SUKSES' : 'GAGAL'}`);
  console.log(`5. Evidence Candidate:        ${candidateEvidenceCount}`);
  console.log(`6. Verified Evidence:         ${verifiedEvidenceCount}`);
  console.log(`7. Proposed Claims:           2`);
  console.log(`8. SUPPORTED Claims Akhir:    ${supportedClaimCount}`);
  console.log('========================================================\n');
}

runLiveSmokeTest().catch((err) => {
  console.error('❌ Terjadi kesalahan pada live smoke test:', err.message || err);
  process.exit(1);
});
