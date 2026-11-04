"use client";

export default function PrintButton() {
  return (
    <button className="oy-btn oy-btn--outline oy-btn--sm" type="button" onClick={() => window.print()}>
      Yazdır
    </button>
  );
}
