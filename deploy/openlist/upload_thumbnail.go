package cloudflare_imgbed

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/jpeg"
	"io"
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
