import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { resolveText } from "@shared/contractTemplates/resolveText";
import type { Block, ContractData } from "@shared/contractTemplates/types";

const styles = StyleSheet.create({
  page:    { padding: 48, fontSize: 10, lineHeight: 1.4, fontFamily: "Helvetica" },
  h1:      { fontSize: 16, textAlign: "center", marginBottom: 12, fontWeight: "bold" },
  h2:      { fontSize: 12, marginTop: 12, marginBottom: 6, fontWeight: "bold" },
  h3:      { fontSize: 11, marginTop: 8,  marginBottom: 4, fontWeight: "bold" },
  p:       { marginBottom: 6 },
  list:    { marginLeft: 12, marginBottom: 6 },
  sigBox:  { marginTop: 32, width: 240, height: 56, borderBottomWidth: 1, borderBottomColor: "black", flexDirection: "row", alignItems: "flex-end" },
  sigLbl:  { fontSize: 9, color: "#555" },
  sigImg:  { maxHeight: 50 },
});

interface Props {
  blocks: Block[];
  data: ContractData;
  workerSignaturePng: string | null;
  managerSignaturePng: string | null;
}

export function ContractDocumentPdf({ blocks, data, workerSignaturePng, managerSignaturePng }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {blocks.map((b) => <PdfBlock key={b.id} block={b} data={data} workerSignaturePng={workerSignaturePng} managerSignaturePng={managerSignaturePng} />)}
      </Page>
    </Document>
  );
}

function PdfBlock({ block, data, workerSignaturePng, managerSignaturePng }: { block: Block; data: ContractData; workerSignaturePng: string | null; managerSignaturePng: string | null; }) {
  switch (block.type) {
    case "heading": {
      const s = block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3;
      return <Text style={s}>{resolveText(block.text, data as Record<string, unknown>)}</Text>;
    }
    case "paragraph":
      return <Text style={styles.p}>{resolveText(block.text, data as Record<string, unknown>)}</Text>;
    case "list":
      return (
        <View style={styles.list}>
          {block.items.map((it, i) => (
            <Text key={i}>{block.ordered ? `${i + 1}. ` : "• "}{resolveText(it, data as Record<string, unknown>)}</Text>
          ))}
        </View>
      );
    case "section":
      return (
        <View>
          {block.title && <Text style={styles.h2}>{resolveText(block.title, data as Record<string, unknown>)}</Text>}
          {block.children.map((c) => <PdfBlock key={c.id} block={c} data={data} workerSignaturePng={workerSignaturePng} managerSignaturePng={managerSignaturePng} />)}
        </View>
      );
    case "signature": {
      const src = block.party === "worker" ? workerSignaturePng : managerSignaturePng;
      return (
        <View>
          <Text style={styles.sigLbl}>{block.label}</Text>
          <View style={styles.sigBox}>{src && <Image src={src} style={styles.sigImg} />}</View>
        </View>
      );
    }
    case "pageBreak":
      return <View break />;
    case "spacer":
      return <View style={{ height: block.height }} />;
  }
}
