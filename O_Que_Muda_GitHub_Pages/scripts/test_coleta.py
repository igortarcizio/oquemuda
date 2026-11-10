import importlib.util
import unittest
from pathlib import Path
p=Path(__file__).with_name('atualizar_dados.py')
spec=importlib.util.spec_from_file_location('coleta',p)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ColetaTests(unittest.TestCase):
    def test_lista_xml_da_camara(self):
        raw=b'<xml><dados><proposicao_><id>2651864</id><siglaTipo>PL</siglaTipo><numero>5798</numero><ano>2026</ano><ementa>Institui politica publica</ementa><dataApresentacao>2026-11-09T18:25</dataApresentacao></proposicao_></dados></xml>'
        obj=module.parse_response(raw,'application/xml')
        self.assertEqual(obj['dados'][0]['id'],'2651864')
        self.assertEqual(module.normalize_record(obj['dados'][0])['numero'],5798)
    def test_detalhes_json(self):
        raw=b'{"dados":{"statusProposicao":{"descricaoTramitacao":"Apresenta\\u00e7\\u00e3o de Proposi\\u00e7\\u00e3o"}}}'
        obj=module.parse_response(raw,'application/json')['dados']
        self.assertEqual(module.get_short_status(obj),'Apresentada')
    def test_status_arquivado(self):
        self.assertEqual(module.get_short_status({'statusProposicao':{'descricaoSituacao':'Arquivada'}}),'Arquivada')

if __name__=='__main__':unittest.main()
