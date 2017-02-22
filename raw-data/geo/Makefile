MAPSHAPER := ../../node_modules/.bin/mapshaper
SVGO := ../../node_modules/.bin/svgo
SIMPLIFY := planar resolution=1990x1990 stats

all: ../../data/jcc-threat-map.svg

statesp010g.shp_nt00938.tar.gz:
	curl -s https://prd-tnm.s3.amazonaws.com/StagedProducts/Small-scale/data/Boundaries/statesp010g.shp_nt00938.tar.gz > $@.1
	mv $@.1 $@

tmp/statesp010g.shp: statesp010g.shp_nt00938.tar.gz
	mkdir -p tmp
	(cd tmp && tar zmxf ../statesp010g.shp_nt00938.tar.gz)

tmp/states-land.shp: tmp/statesp010g.shp
	$(MAPSHAPER) $< encoding=utf-8 no-topology \
		-filter 'TYPE === "Land" && STATE_ABBR !== "PR" && STATE_ABBR !== "VI"' \
		-o $@

tmp/states-mesh.shp: tmp/states-land.shp
	$(MAPSHAPER) $< encoding=utf-8 \
		-innerlines \
		-o $@

tmp/usa-land.shp: tmp/states-land.shp
	$(MAPSHAPER) $< encoding=utf-8 \
		-dissolve \
		-o $@

tmp/jcc-threat-map.svg: tmp/usa-land.shp tmp/states-mesh.shp ../../data/jcc-threats.geojson
	$(MAPSHAPER) $^ combine-files \
		-proj albersusa \
		-simplify $(SIMPLIFY) \
		-svg-style r=20 \
		-o $@ format=svg precision=1 width=2000 margin=5

../../data/jcc-threat-map.svg: tmp/jcc-threat-map.svg
	$(SVGO) --disable=cleanupIDs $< $@
