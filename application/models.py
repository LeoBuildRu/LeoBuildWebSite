from django.db import models
from django.utils import timezone
import uuid
import random

# Create your models here.
    
class Model_Class(models.Model):
    model_name = models.CharField(max_length=200, default='')
    model_logo = models.ImageField("Иконка класса", upload_to="application/static/img/class_icons", default='')
    class_category = models.ManyToManyField(
        'Furniture_Categorie', 
        blank=True, 
        default=None # Можно оставить None для ManyToManyField
    )

    def __str__(self):
        return self.model_name

class Company_Furniture(models.Model):
    company_name = models.CharField(max_length=200, default='')
    company_logo = models.ImageField("Логотип компании", upload_to="application/static/img/brand_icons", default='')
    company_companies = models.ManyToManyField(Model_Class, blank=True, default='')

    def __str__(self):
        return self.company_name

class Furniture_Categorie(models.Model):
    furniture_name = models.CharField(max_length=200, default='')
    furniture_companies = models.ManyToManyField(Company_Furniture, blank=True, default='')

    def __str__(self):
        return self.furniture_name

class Product_Item(models.Model):

    MESH_TYPE_CHOICES = [
        ('mesh', 'Mesh'),
        ('material', 'Material'),
    ]

    MESH_SUBTYPE_CHOICES = [
        ('default', 'Default'),
        ('subtract', 'Subtract'),
    ]

    unique_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    product_name = models.CharField("Наименование(max 16):", max_length=16, default='')
    product_searchTag = models.CharField("Наименование в нижнем регистре(max 16):", max_length=16, default='')
    product_icon = models.ImageField("Иконка товара", upload_to="application/static/img/products_icons", blank=True, null=True,)
    product_url = models.CharField("Ссылка на продукт:", max_length=200, default='')
    product_3Durl = models.CharField("URL 3D модели:", max_length=200, default='')
    product_3Dname = models.CharField("Имя 3D модели:", max_length=200, default='')
    product_price = models.IntegerField("Цена:", default=0)
    product_material = models.CharField("Материал:", max_length=200, default='')
    product_height = models.DecimalField("Высота:", max_digits=10, decimal_places=2, default=0)
    product_width = models.DecimalField("Ширина:", max_digits=10, decimal_places=2, default=0)
    product_depth = models.DecimalField("Глубина:", max_digits=10, decimal_places=2, default=0)
    product_short_description = models.CharField("Краткое описание(max 38):", max_length=38, default='')
    product_description = models.TextField("Полное описание:", default='')

    product_type = models.CharField(max_length=20, choices=MESH_TYPE_CHOICES, default='mesh')
    product_subtype = models.CharField(max_length=20, choices=MESH_SUBTYPE_CHOICES, blank=True, null=True)
    product_material_url = models.ImageField("URL материала", upload_to="application/static/img/materials", blank=True, null=True,)


    product_categories = models.ForeignKey(Furniture_Categorie, on_delete=models.CASCADE, default='')
    product_company = models.ForeignKey(Company_Furniture, on_delete=models.CASCADE, default='')
    product_class = models.ForeignKey(Model_Class, on_delete=models.CASCADE, default='')

    created_date = models.DateTimeField(default=timezone.now)

    def save(self, *args, **kwargs):
        if self.unique_id is None and self.created_date and self.id:
            self.unique_id = self.created_date.strftime('75%Y%m%d23') + str(self.id)
        return super().save(*args, **kwargs)
    
    def __str__(self):
        return self.product_name
    
class Product_Image(models.Model):
    product = models.ForeignKey(Product_Item, related_name='images', on_delete=models.CASCADE, default='')
    image = models.ImageField(upload_to='application/static/img/products_images', blank=True, null=True,)