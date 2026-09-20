/**
 * NexaMOS Vercel Adapter Scaffolding (Infrastructure Boundary)
 *
 * Sourced from NexaMOS Blog Master Reference & Phase 6 specifications.
 * Menjaga isolasi: Domain Publishing tidak mengetahui format API Vercel privat
 * atau token autentikasi Git. Adapter ini deployment-safe dan human-controlled.
 */

import type { PublishingProvider, BuildOutput, DeploymentOutput, DeploymentStatus, ProductionApproval, DeploymentMode } from '../../../engines/publishing/publishing-provider.ts';
import type { PublicationPackage } from '../../../engines/publishing/publication.ts';

export interface VercelAdapterConfig {
  token?: string;
  projectId?: string;
  teamId?: string;
  blogOrigin?: string;
}

export class VercelPublishingAdapter implements PublishingProvider {
  private readonly config: VercelAdapterConfig;

  constructor(config: VercelAdapterConfig = {}) {
    this.config = config;
  }

  public async build(pkg: PublicationPackage, mode: DeploymentMode): Promise<BuildOutput> {
    const buildId = `bld-vcl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      buildId,
      outputFiles: [`/blog/${pkg.slug}/index.html`],
      builtAt: new Date().toISOString()
    };
  }

  public async deploy(
    buildId: string,
    mode: DeploymentMode,
    approval?: ProductionApproval
  ): Promise<DeploymentOutput> {
    if (mode === 'PRODUCTION') {
      if (!approval || !approval.approvedForProduction || !approval.approvedBy) {
        throw new Error('Vercel Adapter: Deployment ke PRODUCTION membutuhkan persetujuan manusia eksplisit.');
      }
    }

    const deploymentId = `dpl-vcl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const baseOrigin = this.config.blogOrigin || 'https://nexamos.cloud';
    const deploymentUrl = mode === 'PRODUCTION' ? `${baseOrigin}/blog` : `https://preview-${deploymentId}.vercel.app`;

    return {
      deploymentId,
      deploymentUrl,
      mode,
      deployedAt: new Date().toISOString()
    };
  }

  public async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus> {
    return {
      state: 'READY',
      url: `https://preview-${deploymentId}.vercel.app`
    };
  }
}
