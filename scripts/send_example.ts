const response = await fetch("http://localhost:3000/orders/receipt", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    orderId: "ORDER-1042",
    buyer: { email: "buyer@example.com", name: "Mina" },
    seller: { displayName: "Northstar Design", supportEmail: "studio@example.com" },
    item: { title: "Launch icon set", amountCents: 4900, currency: "USD" },
    handoff: {
      assetLabel: "Download the icon package",
      assetUrl: "https://example.com/orders/ORDER-1042/assets",
      buyerUpdate: "The package includes SVG and PNG exports plus the usage guide.",
    },
  }),
});

console.log(response.status, await response.json());

export {};
