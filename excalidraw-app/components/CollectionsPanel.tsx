import { useCallback, useEffect, useState } from "react";
import { t } from "@excalidraw/excalidraw/i18n";
import { CloseIcon } from "@excalidraw/excalidraw/components/icons";

import {
  CollectionsStorage,
  type DrawingMetadata,
} from "../data/CollectionsStorage";

import "./CollectionsPanel.scss";

interface CollectionsPanelProps {
  currentDrawingId: string;
  onClose: () => void;
  onOpenDrawing: (drawingId: string) => void;
  onNewDrawing: () => void;
}

export const CollectionsPanel = ({
  currentDrawingId,
  onClose,
  onOpenDrawing,
  onNewDrawing,
}: CollectionsPanelProps) => {
  const [drawings, setDrawings] = useState<DrawingMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadDrawings = useCallback(async () => {
    const list = await CollectionsStorage.listDrawings();
    setDrawings(list);
  }, []);

  useEffect(() => {
    loadDrawings();
  }, [loadDrawings]);

  const handleDelete = async (id: string) => {
    if (id === currentDrawingId) {
      return;
    }
    if (!window.confirm(t("collections.confirmDelete"))) {
      return;
    }
    await CollectionsStorage.deleteDrawing(id);
    loadDrawings();
  };

  const handleDuplicate = async (id: string) => {
    const duplicated = await CollectionsStorage.duplicateDrawing(id);
    if (duplicated) {
      loadDrawings();
    }
  };

  const handleRenameStart = (drawing: DrawingMetadata) => {
    setRenamingId(drawing.id);
    setRenameValue(drawing.name);
  };

  const handleRenameSave = async () => {
    if (renamingId && renameValue.trim()) {
      await CollectionsStorage.updateDrawing(renamingId, {
        name: renameValue.trim(),
      });
      setRenamingId(null);
      setRenameValue("");
      loadDrawings();
    }
  };

  const filteredDrawings = drawings.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("collections.justNow");
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className="collections-panel-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className="collections-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t("collections.title")}
      >
        <div className="collections-panel-header">
          <h2>{t("collections.title")}</h2>
          <button
            className="collections-panel-close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            {CloseIcon}
          </button>
        </div>

        <div className="collections-panel-actions">
          <button
            className="collections-panel-new"
            onClick={onNewDrawing}
            type="button"
          >
            + {t("collections.newDrawing")}
          </button>
          <input
            type="text"
            className="collections-panel-search"
            placeholder={t("collections.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="collections-panel-list">
          {filteredDrawings.length === 0 && (
            <div className="collections-panel-empty">
              {t("collections.noDrawings")}
            </div>
          )}
          {filteredDrawings.map((drawing) => (
            <div
              key={drawing.id}
              className={`collections-panel-item ${
                drawing.id === currentDrawingId ? "active" : ""
              }`}
              onClick={() => {
                if (drawing.id !== currentDrawingId) {
                  onOpenDrawing(drawing.id);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && drawing.id !== currentDrawingId) {
                  onOpenDrawing(drawing.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="collections-panel-thumbnail">
                {drawing.thumbnail ? (
                  <img src={drawing.thumbnail} alt={drawing.name} />
                ) : (
                  <div className="collections-panel-thumbnail-placeholder" />
                )}
              </div>
              <div className="collections-panel-info">
                {renamingId === drawing.id ? (
                  <input
                    type="text"
                    className="collections-panel-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleRenameSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleRenameSave();
                      } else if (e.key === "Escape") {
                        setRenamingId(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="collections-panel-name-row">
                    <span
                      className="collections-panel-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleRenameStart(drawing);
                      }}
                    >
                      {drawing.name}
                    </span>
                    <button
                      className="collections-panel-btn-rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameStart(drawing);
                      }}
                      title="Rename"
                      type="button"
                    >
                      ✎
                    </button>
                  </div>
                )}
                <span className="collections-panel-date">
                  {formatDate(drawing.updatedAt)}
                </span>
              </div>
              <div className="collections-panel-item-actions">
                <button
                  className="collections-panel-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDuplicate(drawing.id);
                  }}
                  title={t("collections.duplicate")}
                  type="button"
                >
                  {t("collections.duplicate")}
                </button>
                {drawing.id !== currentDrawingId && (
                  <button
                    className="collections-panel-btn collections-panel-btn-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(drawing.id);
                    }}
                    title={t("collections.delete")}
                    type="button"
                  >
                    {t("collections.delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
