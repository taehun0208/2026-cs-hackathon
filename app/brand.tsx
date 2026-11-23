export const SERVICE_NAME = "COMPFit";
export const SERVICE_TAGLINE = "컴퓨터 직무, 해보고 맞는지 가늠하기";

export function BrandText() {
  return (
    <span className="brand-text">
      <b>{SERVICE_NAME}</b>
      <small>{SERVICE_TAGLINE}</small>
    </span>
  );
}
