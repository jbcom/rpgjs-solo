export const getGraphicKey = (graphic: any): string | null => {
  if (!graphic) return null;
  if (typeof graphic === "string") return graphic;
  if (typeof graphic === "object") {
    return (
      graphic.id ||
      graphic._id ||
      graphic.mediaId ||
      graphic.graphic ||
      graphic.fileName ||
      null
    );
  }
  return null;
};
