import { render, screen } from "@testing-library/react";
import { StoreProductCardImage } from "../StoreProductCardImage";

describe("StoreProductCardImage", () => {
  it("crops catalog cards to a square", () => {
    const { container } = render(
      <StoreProductCardImage src="/photo.png" alt="Hoodie" data-testid="store-product-image" />,
    );
    const img = screen.getByTestId("store-product-image");
    expect(img).toHaveClass("object-cover");
    expect(img).not.toHaveClass("object-contain");
    expect(container.firstChild).toHaveClass("aspect-square");
  });

  it("shows the full photo, centered, on the detail hero", () => {
    const { container } = render(
      <StoreProductCardImage
        src="/photo.png"
        alt="Brunch"
        fit="contain"
        data-testid="store-product-image"
      />,
    );
    const img = screen.getByTestId("store-product-image");
    expect(img).toHaveClass("object-contain", "w-full", "max-h-[min(70vh,520px)]");
    expect(img).not.toHaveClass("object-cover");
    expect(container.firstChild).toHaveClass("justify-center", "w-full");
    expect(container.firstChild).not.toHaveClass("aspect-square");
  });
});
