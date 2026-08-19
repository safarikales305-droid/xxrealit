type Props = {
  data: Record<string, unknown> | Array<Record<string, unknown>> | null | undefined;
};

export function JsonLdScript({ data }: Props) {
  if (!data) return null;
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
