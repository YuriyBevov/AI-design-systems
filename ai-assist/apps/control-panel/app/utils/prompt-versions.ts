export type PromptRevisionMarker = "Текущий" | "Черновик" | null;

export const getPromptRevisionMarker = (
  revisionNo: number,
  currentRevisionNo: number | null,
): PromptRevisionMarker => {
  if (revisionNo === currentRevisionNo) return "Текущий";
  return "Черновик";
};

export const promptContentDiffers = (left: string, right: string | undefined): boolean =>
  left !== (right ?? "");
