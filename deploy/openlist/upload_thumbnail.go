package cloudflare_imgbed

import (
	"bytes"
	"context"
	"encoding/base64"
	"github.com/OpenListTeam/OpenList/v4/internal/conf"
	"image"
	"image/jpeg"
	"io"
	"os"
	"path"
	"strings"

	"github.com/OpenListTeam/OpenList/v4/internal/model"
	"github.com/disintegration/imaging"
	_ "golang.org/x/image/webp"
)

// Bound decoded memory on small VPSs. Originals are never modified.
var thumbnailSlots = make(chan struct{}, 2)

func thumbnailEligible(file model.FileStreamer) bool {
	if file.GetSize() <= 0 || file.GetSize() > 128*1024*1024 {
		return false
	}
	switch strings.ToLower(path.Ext(file.GetName())) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff":
		return true
	}
	return false
}

// Reads only the local upload cache; never downloads from the destination.
func makeUploadThumbnail(ctx context.Context, file model.FileStreamer) string {
	if !thumbnailEligible(file) || file.GetFile() == nil {
		return ""
	}
	select {
	case thumbnailSlots <- struct{}{}:
	case <-ctx.Done():
		return ""
	}
	defer func() { <-thumbnailSlots }()
	local := file.GetFile()
	config, _, err := image.DecodeConfig(io.NewSectionReader(local, 0, file.GetSize()))
	if err != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 32_000_000 {
		return ""
	}
	img, err := imaging.Decode(io.NewSectionReader(local, 0, file.GetSize()), imaging.AutoOrientation(true))
	if err != nil || ctx.Err() != nil {
		return ""
	}
	thumb := imaging.Fit(img, 480, 480, imaging.Linear)
	var encoded bytes.Buffer
	if jpeg.Encode(&encoded, thumb, &jpeg.Options{Quality: 75}) != nil || encoded.Len() > 250*1024 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(encoded.Bytes())
}

// Own only a thumbnail capture, never the caller's original stream.
type chunkThumbnailCapture struct {
	model.FileStreamer
	local   *os.File
	written int64
	failed  bool
	ready   bool
}

func (c *chunkThumbnailCapture) Read(p []byte) (int, error) {
	n, err := c.FileStreamer.Read(p)
	if n > 0 && !c.failed {
		w, e := c.local.Write(p[:n])
		c.written += int64(w)
		if e != nil || w != n {
			c.failed = true
		}
	}
	return n, err
}
func (c *chunkThumbnailCapture) GetFile() model.File {
	if c.ready {
		return c.local
	}
	return nil
}
func captureChunkThumbnail(ctx context.Context, file model.FileStreamer) (model.FileStreamer, func() string) {
	if !thumbnailEligible(file) {
		return file, func() string { return "" }
	}
	if file.GetFile() != nil {
		done := false
		return file, func() string {
			if done || ctx.Err() != nil {
				return ""
			}
			done = true
			return makeUploadThumbnail(ctx, file)
		}
	}
	if err := os.MkdirAll(conf.Conf.TempDir, 0700); err != nil {
		return file, func() string { return "" }
	}
	local, err := os.CreateTemp(conf.Conf.TempDir, "chunk-thumbnail-*")
	if err != nil {
		return file, func() string { return "" }
	}
	capture := &chunkThumbnailCapture{FileStreamer: file, local: local}
	finished := false
	finish := func() string {
		if finished {
			return ""
		}
		finished = true
		defer func() { local.Close(); os.Remove(local.Name()) }()
		if ctx.Err() != nil || capture.failed || capture.written != file.GetSize() {
			return ""
		}
		capture.ready = true
		return makeUploadThumbnail(ctx, capture)
	}
	return capture, finish
}

// Reports source reads without changing caching/range behavior.
type chunkSourceProgress struct {
	model.FileStreamer
	onRead func(int)
}

func (c *chunkSourceProgress) Read(p []byte) (int, error) {
	n, e := c.FileStreamer.Read(p)
	if n > 0 {
		c.onRead(n)
	}
	return n, e
}
