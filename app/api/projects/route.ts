export const runtime = "edge";

export async function GET(): Promise<Response> {
  return Response.json({
    projects: [
      {
        name: "킨텍스 제3전시장",
        status: "construction",
        lat: 37.665,
        lng: 126.744,
      },
    ],
  });
}
