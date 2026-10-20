/**
 * Typed calls for the client brief and its project-scoped assets.
 *
 * Uploads send the file's raw bytes (`application/octet-stream`) with the
 * metadata in query params: one small request per file, no encoding overhead,
 * and the app-wide JSON body parser never sees a 20 MB payload.
 */
import type {
  AssetDto,
  AssetListResponseDto,
  BriefResponseDto,
  DeleteAssetResponseDto,
  ProjectBrief,
  UploadAssetResponseDto,
} from "@luvify/shared";
import { api } from "./api";

export function getBrief(projectId: string): Promise<BriefResponseDto> {
  return api<BriefResponseDto>(`/api/projects/${projectId}/brief`);
}

export function putBrief(projectId: string, brief: ProjectBrief): Promise<BriefResponseDto> {
  return api<BriefResponseDto>(`/api/projects/${projectId}/brief`, {
    method: "PUT",
    body: JSON.stringify(brief),
  });
}

export function listAssets(projectId: string): Promise<AssetListResponseDto> {
  return api<AssetListResponseDto>(`/api/projects/${projectId}/assets`);
}

export interface UploadInput {
  file: File;
  /** Brief slot id the file belongs to ("" for loose imports like CSV). */
  category: string;
  alt?: string;
}

export function uploadAsset(projectId: string, input: UploadInput): Promise<UploadAssetResponseDto> {
  const params = new URLSearchParams({
    filename: input.file.name,
    category: input.category,
    alt: input.alt ?? "",
  });
  return api<UploadAssetResponseDto>(`/api/projects/${projectId}/assets?${params.toString()}`, {
    method: "POST",
    body: input.file,
    headers: { "content-type": "application/octet-stream" },
  });
}

export function deleteAsset(projectId: string, assetId: string): Promise<DeleteAssetResponseDto> {
  return api<DeleteAssetResponseDto>(`/api/projects/${projectId}/assets/${assetId}`, {
    method: "DELETE",
  });
}

export type { AssetDto };
