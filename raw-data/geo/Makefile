MAPSHAPER := ../../node_modules/.bin/mapshaper
SVGO := ../../node_modules/.bin/svgo
WIDTH := 2000

all: ../../data/shape-we-use-to-calculate-transform.topojson ../../data/jcc-threat-map.svg ../../data/cities.geojson

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

../../data/cities.geojson: tmp/citiesx010g.shp Makefile
	$(MAPSHAPER) $< encoding=utf-8 \
		-sort 'this.properties.POP_2010' \
		-each 'id = NAME + " " + STATE' \
		-filter-fields id \
		-o $@ precision=0.0001

# Used to calculate bounds
../../data/shape-we-use-to-calculate-transform.topojson: tmp/states-land.shp
	$(MAPSHAPER) $< encoding=utf-8 \
		-filter-fields '' \
		-dissolve \
		-simplify 10% \
		-o $@

tmp/jcc-threat-map-unoptimized.svg: tmp/states-land.shp
	$(MAPSHAPER) $< \
		-lines \
		-filter-fields '' \
		-rename-layers mesh \
		-proj albersusa \
		-simplify planar resolution=1990x1990 stats \
		-o $@ format=svg precision=1 width=2000 margin=5

../../data/jcc-threat-map.svg: tmp/jcc-threat-map-unoptimized.svg
	$(SVGO) $< $@
