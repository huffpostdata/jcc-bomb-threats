MAPSHAPER := ../../node_modules/.bin/mapshaper
SVGO := ../../node_modules/.bin/svgo

all: ../../data/jcc-threat-map.topojson ../../data/cities.geojson

statesp010g.shp_nt00938.tar.gz:
	curl -s https://prd-tnm.s3.amazonaws.com/StagedProducts/Small-scale/data/Boundaries/statesp010g.shp_nt00938.tar.gz > $@

citiesx010g_shp_nt00962.tar.gz:
	curl -s https://prd-tnm.s3.amazonaws.com/StagedProducts/Small-scale/data/Boundaries/citiesx010g_shp_nt00962.tar.gz > $@

tmp/statesp010g.shp: statesp010g.shp_nt00938.tar.gz
	mkdir -p tmp
	(cd tmp && tar zmxf ../$<)

tmp/states-land.shp: tmp/statesp010g.shp
	$(MAPSHAPER) $< encoding=utf-8 no-topology \
		-filter 'TYPE === "Land" && STATE_ABBR !== "PR" && STATE_ABBR !== "VI"' \
		-o $@

tmp/citiesx010g.shp: citiesx010g_shp_nt00962.tar.gz
	mkdir -p tmp
	(cd tmp && tar zmxf ../$<)

../../data/cities.geojson: tmp/citiesx010g.shp
	$(MAPSHAPER) $< encoding=utf-8 \
		-filter 'POP_2010 >= 5000' \
		-each 'id = NAME + " " + STATE' \
		-filter-fields id \
		-o $@ precision=0.0001

tmp/states-mesh.shp: tmp/states-land.shp
	$(MAPSHAPER) $< encoding=utf-8 \
		-innerlines \
		-o $@

tmp/usa-land.shp: tmp/states-land.shp
	$(MAPSHAPER) $< encoding=utf-8 \
		-dissolve \
		-o $@

../../data/jcc-threat-map.topojson: tmp/usa-land.shp tmp/states-mesh.shp
	$(MAPSHAPER) $^ combine-files \
		-rename-layers usa-land,states-mesh \
		-o $@

../../data/jcc-threat-map.svg: tmp/jcc-threat-map.svg
	$(SVGO) --disable=cleanupIDs $< $@
