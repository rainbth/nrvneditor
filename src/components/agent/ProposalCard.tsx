import { type Change, diffLines } from "diff";
import { Check, MessageSquare, RotateCcw, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { AgentProposal } from "../../../electron/types";
import { blockExcerpt, blockLabelFromKey } from "../../lib/block-labels";
import { springSoft } from "../../lib/motion";
import { resolveProposalAnchorKey } from "../../lib/proposal";
import { useAgentStore } from "../../store/agent";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";

const MAX_DOCUMENT_DIFF_LINES = 400;

export interface DiffRow {
  kind: "same" | "add" | "del";
  offset: number;
  text: string;
}

export function diffRows(before: string, after: string): DiffRow[] {
  const normalize = (value: string): string => value.replace(/\r\n/g, "\n");
  const changes: Change[] = diffLines(normalize(before), normalize(after));
  const rows: DiffRow[] = [];
  let offset = 0;
  for (const change of changes) {
    const kind = change.added ? "add" : change.removed ? "del" : "same";
    for (const line of change.value.replace(/\n$/, "").split("\n")) {
      rows.push({ kind, offset, text: line });
      offset += line.length + 1;
    }
  }
  return rows;
}

function DiffLines({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="agent-diff">
      {rows.map((row) => (
        <span key={`${row.kind}-${row.offset}`} className={`agent-diff-line diff-${row.kind}`}>
          <span className="agent-diff-prefix" aria-hidden="true">
            {row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "}
          </span>
          <span className="sr-only">
            {row.kind === "add"
              ? "Añadido: "
              : row.kind === "del"
                ? "Eliminado: "
                : "Sin cambios: "}
          </span>
          <span className="agent-diff-text">{row.text}</span>
        </span>
      ))}
    </div>
  );
}

interface ProposalBlockDiffProps {
  blockKey: string;
  before: string;
  after: string;
}

function ProposalBlockDiff({ blockKey, before, after }: ProposalBlockDiffProps) {
  const rows = diffRows(before, after);
  return (
    <div className="agent-proposal-block">
      <div className="agent-proposal-block-header">
        <span className="agent-proposal-label">{blockLabelFromKey(blockKey)}</span>
        <span className="agent-proposal-excerpt">{blockExcerpt(after)}</span>
      </div>
      <details className="agent-proposal-details">
        <summary>Detalle técnico</summary>
        <code>{blockKey}</code>
      </details>
      <DiffLines rows={rows} />
    </div>
  );
}

export interface ProposalCardProps {
  proposal: AgentProposal;
  variant?: "panel" | "inline";
  onAskChanges?: () => void;
  /** El usuario pidió cambios: el diff se mantiene visible hasta enviar. */
  revisionRequested?: boolean;
  variantFromReview?: boolean;
}

/** Tarjeta de propuesta con diff por bloque/documento y acciones humanas. */
export function ProposalCard({
  proposal,
  revisionRequested = false,
  variantFromReview = false,
  variant = "panel",
  onAskChanges,
}: ProposalCardProps) {
  const reduceMotion = useReducedMotion();
  const inline = variant === "inline";
  const busy = useAgentStore((state) => state.busy);
  const applying = useAgentStore((state) => state.applying);
  const path = useDocumentStore((state) => state.path);
  const accept = useAgentStore((state) => state.acceptProposal);
  const reject = useAgentStore((state) => state.rejectProposal);
  const requestChanges = useAgentStore((state) => state.requestChanges);
  const cancelRevision = useAgentStore((state) => state.cancelRevision);
  const mode = useUiStore((state) => state.mode);
  const blocks = useDocumentStore((state) => state.blocks);
  const selection = useSelectionStore((state) => state);

  const draft = path === null;
  const documentChange = proposal.kind === "document" ? proposal.document : null;
  const isDocument = documentChange !== null;
  const documentRows =
    documentChange !== null ? diffRows(documentChange.before, documentChange.after) : [];
  const clipped = documentRows.length > MAX_DOCUMENT_DIFF_LINES;
  const rows = clipped ? documentRows.slice(0, MAX_DOCUMENT_DIFF_LINES) : documentRows;
  const anchorKey = resolveProposalAnchorKey(proposal, blocks, selectedIndexes(selection, blocks));
  const inlineAvailable =
    variant === "panel" &&
    proposal.kind === "blocks" &&
    proposal.blocks.length > 1 &&
    mode === "render" &&
    anchorKey !== null;
  const singleInRender =
    variant === "panel" &&
    proposal.kind === "blocks" &&
    proposal.blocks.length === 1 &&
    mode === "render";
  const goToInline = () => {
    useAgentStore.getState().showBlockPreviewForProposal();
    const preview = document.querySelector<HTMLElement>('[data-previewing="true"]');
    preview?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    preview?.focus();
  };

  return (
    <motion.section
      initial={inline ? false : { opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={inline ? undefined : { opacity: 0, y: -4 }}
      transition={reduceMotion ? { duration: 0 } : springSoft}
      className="agent-proposal"
      data-testid={variant === "inline" ? "proposal-bubble-card" : "agent-proposal"}
      data-kind={proposal.kind}
      data-state={revisionRequested ? "revision" : "active"}
      data-variant={variantFromReview ? "review" : undefined}
      aria-label="Propuesta del agente"
    >
      <header className="agent-proposal-header">
        <span className="agent-proposal-title">
          {isDocument
            ? "Propuesta · Documento completo"
            : `Propuesta · ${proposal.blocks.length} ${
                proposal.blocks.length === 1 ? "bloque" : "bloques"
              }`}
        </span>
        {revisionRequested ? (
          <span className="agent-proposal-revision-badge" data-testid="agent-proposal-revision">
            Pendiente de revisión
          </span>
        ) : null}
        {variantFromReview ? (
          <span className="agent-proposal-revision-badge" data-testid="agent-proposal-variant">
            Variante desde revisión
          </span>
        ) : null}
      </header>

      {draft ? (
        <p className="agent-draft-warning">
          Este documento no está guardado. La propuesta se aplicará al borrador en memoria.
        </p>
      ) : null}

      {singleInRender ? (
        <div className="agent-proposal-actions">
          <p className="agent-proposal-inline-note" data-testid="agent-proposal-inline-note">
            La propuesta se compara en el documento junto al bloque.
          </p>
          <button
            type="button"
            className="button"
            data-testid="agent-proposal-goto-inline"
            onClick={goToInline}
          >
            Ver propuesta en el documento
          </button>
        </div>
      ) : isDocument && documentChange !== null ? (
        <div className="agent-proposal-document">
          <DiffLines rows={rows} />
          {clipped ? (
            <p className="agent-proposal-clipped">
              Diff recortado a {MAX_DOCUMENT_DIFF_LINES} líneas de {documentRows.length}.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="agent-proposal-blocks">
          {proposal.blocks.map((block) => (
            <ProposalBlockDiff
              key={block.key}
              blockKey={block.key}
              before={block.before}
              after={block.after}
            />
          ))}
        </div>
      )}

      {singleInRender ? null : inlineAvailable ? (
        <div className="agent-proposal-actions">
          <p className="agent-proposal-inline-note" data-testid="agent-proposal-inline-note">
            Las acciones están junto al bloque propuesto en el documento.
          </p>
          <button
            type="button"
            className="button"
            data-testid="agent-proposal-goto-inline"
            onClick={goToInline}
          >
            Ver propuesta en el documento
          </button>
        </div>
      ) : revisionRequested ? (
        <div className="agent-proposal-actions">
          <button
            type="button"
            className="button"
            data-testid={
              variant === "inline" ? "proposal-bubble-cancel-revision" : "agent-cancel-revision"
            }
            onClick={cancelRevision}
            disabled={busy || applying}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Cancelar revisión
          </button>
        </div>
      ) : (
        <div className="agent-proposal-actions">
          <button
            type="button"
            className="button button-primary"
            data-testid={variant === "inline" ? "proposal-bubble-accept" : "agent-proposal-accept"}
            onClick={() => void accept()}
            disabled={busy || applying}
          >
            <Check size={14} aria-hidden="true" />
            {isDocument ? "Aceptar documento" : draft ? "Aplicar al borrador" : "Aceptar"}
          </button>
          <button
            type="button"
            className="button"
            data-testid={variant === "inline" ? "proposal-bubble-reject" : "agent-proposal-reject"}
            onClick={reject}
            disabled={busy || applying}
          >
            <X size={14} aria-hidden="true" />
            Rechazar
          </button>
          <button
            type="button"
            className="button"
            data-testid={
              variant === "inline" ? "proposal-bubble-changes" : "agent-proposal-changes"
            }
            onClick={onAskChanges ?? requestChanges}
            disabled={busy || applying}
          >
            <MessageSquare size={14} aria-hidden="true" />
            Pedir cambios
          </button>
        </div>
      )}
    </motion.section>
  );
}

export interface ProposalErrorCardProps {
  raw: string;
  reason: string;
}

/** Contrato roto: se muestra el crudo y nunca se aplica nada. */
export function ProposalErrorCard({ raw, reason }: ProposalErrorCardProps) {
  const discard = useAgentStore((state) => state.clearProposalError);
  return (
    <section className="agent-proposal-error" role="alert" aria-label="Propuesta inválida">
      <p className="agent-proposal-error-title">La propuesta no sigue el contrato</p>
      <p className="agent-proposal-error-reason">{reason}</p>
      <pre className="agent-proposal-raw" data-testid="agent-proposal-raw">
        {raw}
      </pre>
      <button type="button" className="button" onClick={discard}>
        Descartar
      </button>
    </section>
  );
}
